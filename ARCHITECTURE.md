# Project Architecture & State Management Rules

**CRITICAL INSTRUCTION FOR AI ASSISTANTS:** This project does **not** use Redux, Zustand, Recoil, or React Context + `useState` for **shared domain state**. Shared state uses a custom hierarchical Proxy system under `src/components/state/`.

`Node.js` does use React `createContext` internally to walk the component tree — do not add a second global store on top of that.

## 1. Core Concepts

| Module | Path | Role |
| --- | --- | --- |
| **Node** | `src/components/state/Node.js` | Spatial hierarchy mirroring the React tree. Stores attach to nodes. |
| **Object** | `src/components/state/Object.js` | Proxy wrapper; mutations notify subscribers (microtask-batched). |
| **State** | `src/components/state/State.js` | `createState(displayName)` factory → component + hooks. |
| **StateUtils** | `src/components/state/StateUtils.js` | `setInDraft`, `updateInDraft`, `deleteInDraft`, `remapKeysInDraft`, `deleteKeysWithPrefixInDraft`. |

Domain stores (`AppState`, `EditorState`, …) are **bootstrapped in `App.js` on the root node** via `XState.useState(null, initial)`. Per-file UI stores pass `initial` under `<Node id={filePath}>` so they are scoped to that node.

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
3. Do not modify `Node.js`, `Object.js`, or `State.js` unless explicitly instructed.
4. For nested map updates, prefer `StateUtils` helpers so Proxy notifications always fire.
