# AGENTS.md

Guidance for AI coding assistants and automated agents working in Zakamurai.

## Read first

- [ARCHITECTURE.md](./ARCHITECTURE.md) — proxy state rules, editor model, AI pipeline, preview security (non-negotiable).
- [README.md](./README.md) — commands, project layout, browser storage caveats.

## Project shape

Zakamurai is a single Next.js 16 / React 19 app (no backend, no database). Persistence, compilation, AI, and preview run in the browser. The only server process is the Next.js dev server.

## Architecture rules (summary)

1. **State** — Use `XState.useState` / `usePassiveState` from `triactor`, under the application’s `StateRoot`. Never use Redux, Zustand, Recoil, or React `useState` for shared domain state.
2. **Styling** — CSS Modules only in UI components. No Tailwind. Avoid inline `style={{}}` when the file imports a `.module.css`.
3. **AI edits** — Use SEARCH/REPLACE blocks (`<<<<<<< SEARCH` / `=======` / `>>>>>>> REPLACE`). Paths must be project-relative; absolute paths and `../` traversal are rejected.
4. **Preview** — Preview runs on a separate origin. MessagePort handshakes require matching origin, session ID, and protocol version. No wildcard target origins.

## AI edit flow

```
User prompt → Agent/Runner → validateAIChanges → pendingDiffs → user review → Applier → fileContents
```

Key modules: `src/components/AI/Agent/`, `src/components/AI/Processor/`, `src/components/AI/ChangeValidator.ts`.

## Quality gates

| Command | Runs in CI | Purpose |
| --- | --- | --- |
| `npm run verify` | mirrors CI | Full non-mutating local gate |
| `npm run check:architecture` | yes | Codified architecture rules |
| `npm run test:promptfoo` | yes | Static AI compliance (no API keys) |
| `npm run test:coverage` | yes | Vitest with 80% global thresholds |
| `npm run verify:ai` | no | Optional extended AI regression |

`verify` never rewrites source files. Use `npm run format` and `npm run stylelint:fix` to apply fixes.

### Static promptfoo (`test:promptfoo`)

Uses the `echo` provider in [promptfooconfig.yaml](./promptfooconfig.yaml). **No API keys required.** Golden fixtures live in `tests/ai-golden/`.

### Optional `verify:ai`

Runs [scripts/verify-ai.sh](./scripts/verify-ai.sh):

1. Architectural drift scan via `lucidshark` or `lucid` (skipped if not on PATH)
2. `promptfoo eval`
3. Performance budget check
4. Full visual regression (Chromium + WebKit)

Install lucidshark and add it to PATH to enable the architectural scan. See lucidshark releases for install instructions.

## Cursor Cloud specific instructions

### Running

- Dev server: `npm run dev` serves the IDE on `http://localhost:3000`.
- `predev`/`prebuild`/`postinstall` copy `almostnode` + ONNX/esbuild WASM assets into `public/` (`setup:almostnode`, `setup:wasm`). If `public/lib/almostnode`, `public/wasm`, or `public/esbuild` look empty, re-run `npm install` (or `npm run setup:almostnode && npm run setup:wasm`) rather than debugging Next.

### Known pre-existing caveats (not environment issues)

- `npm run format:check` (Biome) may still report a few formatting diffs on a clean checkout. Prefer `npm run format` when touching those files.
- In-browser Build/Preview uses the custom esbuild-wasm resolver in `src/utils/compiler/browser-bundler.tsx`. Object-shaped package `browser` maps (e.g. react-dom) are applied via `applyBrowserRemap` and must not be treated as entry path strings.

### Playwright / visual tests

- `postinstall` downloads Chromium + WebKit browsers, but Playwright prints a Linux host-requirements warning because some system libraries are missing. Browsers still download. Running `npm run test:visual` may require system browser deps (`npx playwright install-deps`, needs root/apt) before it works.

### LocalFS

- `src/components/Storage/LocalFS.tsx` uses the File System Access API and IndexedDB in the browser. It is not available in all environments (for example headless CI or browsers without the API).
