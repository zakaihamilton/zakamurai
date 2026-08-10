# Project Architecture & State Management Rules

**CRITICAL INSTRUCTION FOR AI ASSISTANTS:** This project does **not** use Redux, Zustand, Recoil, or React Context + `useState` for **shared domain state**. Shared state uses a custom hierarchical Proxy system under `src/components/state/`.

`Node.js` does use React `createContext` internally to walk the component tree — do not add a second global store on top of that.

## 1. Core Concepts

| Module | Path | Role |
| --- | --- | --- |
| **Node** | `src/components/state/Node.tsx` | Spatial hierarchy mirroring the React tree. Stores attach to nodes. |
| **Object** | `src/components/state/Object.ts` | Proxy wrapper; mutations notify subscribers (microtask-batched). |
| **State** | `src/components/state/State.tsx` | `createState(displayName)` factory → component + hooks. |
| **StateUtils** | `src/components/state/StateUtils.tsx` | `setInDraft`, `updateInDraft`, `deleteInDraft`, `remapKeysInDraft`, `deleteKeysWithPrefixInDraft`. |

Domain stores (`AppState`, `EditorState`, …) are **bootstrapped in `App.tsx` on the root node** via `XState.useState(null, initial)`. Per-file UI stores pass `initial` under `<Node id={filePath}>` so they are scoped to that node.

## 2. Reading State

```javascript
import { EditorState } from '@/components/App/Views/EditorArea';

function MyComponent() {
  // Selector only controls which key changes trigger re-render.
  // The return value is always the full proxy store — not a primitive slice.
  const editorState = EditorState.useState(['fileContents', 'pendingDiffs']);
  const { fileContents } = editorState;

  // Read without subscribing (callbacks / hot paths):
  const passive = EditorState.usePassiveState();
}
```

`State.useFutureState` listens up the hierarchy until a store appears (rarely needed in production UI).

## 3. Mutating State (STRICT RULES)

Mutate by assigning on the proxy or via a draft callback. **Never** return a cloned root object from a setter.

### Shallow Mutation Only

The draft is a shallow clone of top-level keys. Nested maps must be **replaced** (or updated via StateUtils):

```javascript
editorState((draft) => {
  draft.fileContents = { ...draft.fileContents, [path]: nextContent };
  // or: setInDraft(draft, ['fileContents', path], nextContent);
});
```

**FORBIDDEN:**
- `draft.fileContents[path] = x` without reassigning `draft.fileContents`
- `delete draft.pendingDiffs[path]` without replacing the map (use `deleteInDraft`)
- `useState` for shared domain state
- Nested in-place array mutation (`draft.items.push(...)`)

## 4. Editor Content Model

| Layer | Store | Role |
| --- | --- | --- |
| Canonical buffers | `EditorState.fileContents` | Persistence, AI, compiler |
| Typing surface | `EditorAreaUiState.localContent` | Per-file Node; synced via FileLoader |
| AI review | `EditorState.pendingDiffs` / `pendingDeletions` | Approve/undo before disk flush |

Manual edits clear `pendingDiffs[path]`. Pending review blocks FS auto-save.

## 5. Reliability Boundaries

- AI changes are validated as project-relative paths before entering `fileContents` or
  `pendingDiffs`; absolute paths, traversal, duplicate targets, and malformed content are rejected.
- Storage uses IndexedDB first and localStorage second. `StorageHealthState` is transient UI state:
  it records `healthy`, `fallback`, or `write-failed` without changing persisted settings formats.
- Preview bridge handshakes validate configured origin, active iframe window, protocol version, and
  session ID before accepting a `MessagePort`. Do not use wildcard target origins for this bridge.

## 6. Component Generation Strategy

1. Prefer presentational components that receive props.
2. Containers subscribe with `XState.useState(...)` / `usePassiveState` and pass primitives down.
3. Do not modify `Node.tsx`, `Object.ts`, or `State.tsx` unless explicitly instructed.
4. For nested map updates, prefer `StateUtils` helpers so Proxy notifications always fire.

## 7. AI Pipeline

| Module | Path | Role |
| --- | --- | --- |
| **Prompts** | `src/components/AI/Prompts.ts` | System prompts and output format instructions |
| **Processor** | `src/components/AI/Processor/` | Parses AI responses, SEARCH/REPLACE application |
| **ChangeValidator** | `src/components/AI/ChangeValidator.ts` | Path safety, syntax checks before staging |
| **Agent** | `src/components/AI/Agent/` | `runAgent`, collaborative runner, applier |
| **WebLLM** | `src/components/AI/WebLLMAPI.tsx` | In-browser model inference |

Flow: user prompt → agent collects workspace context → model output → parser → validator → `EditorState.pendingDiffs` → user approves → applier updates `fileContents` and triggers build.

AI changes must use project-relative paths. `validateAIChanges` rejects absolute paths, traversal, duplicates, and malformed content before staging.

## 8. Preview Security Model

- IDE and preview run on **different origins** in configured production deployments
  (`NEXT_PUBLIC_IDE_ORIGIN`, `NEXT_PUBLIC_PREVIEW_ORIGIN`). Unconfigured `*.vercel.app`
  deployments use an explicit same-origin `/__preview/` compatibility surface with weaker
  isolation.
- `PreviewBridge` (IDE side) and `PreviewHost` (preview origin) exchange a one-time `zakamurai-preview-connect` handshake with protocol version and session ID before transferring a `MessagePort`.
- `isValidPreviewHandshake` in `previewOrigins.ts` is shared — do not relax checks on one side only.
- In isolated mode, user project code never receives same-origin access to IDE storage, cookies,
  or the parent DOM. The unconfigured Vercel compatibility surface intentionally has weaker
  same-origin isolation.

## 9. Testing Expectations

- Unit tests: Vitest (`npm run test`, `npm run test:coverage`). Global coverage thresholds: 80%. AI modules target 85%.
- Architecture: `npm run check:architecture` enforces styling and state patterns in `src/components/`.
- AI golden fixtures: `tests/ai-golden/` + `npm run test:promptfoo`.
- E2E: Playwright smoke (`test:e2e`), isolated preview security (`test:e2e:isolated`), visual regression (`test:visual:chromium` in CI).
- Pre-commit: lint-staged runs Biome and `vitest related` on changed files.

Contributors and agents should run `npm run verify` before opening a PR.
