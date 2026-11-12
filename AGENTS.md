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
4. **Preview** — Preview runs on a separate origin. MessagePort handshakes require matching origin, session ID, and protocol version. Handshake, error, and reconnect `postMessage` must use an exact IDE origin (never `*`).

## AI edit flow

```
User prompt → runManager → validateAIChanges → fileContents + pendingDiffs → user review (Build/Preview already use proposed buffers)
```

Key modules: `src/components/AI/Agent/` (`runManager`, action loop), `src/components/AI/ChangeValidator.tsx`. The Processor SEARCH/REPLACE parser is legacy (tests/fixtures). DiffEngine and PathResolver from Processor remain in the production apply path.

## Quality gates

| Command | Runs in CI | Purpose |
| --- | --- | --- |
| `pnpm run verify` | mirrors CI | Full non-mutating local gate |
| `pnpm run check:architecture` | yes | Codified architecture rules |
| `pnpm run test:promptfoo` | yes | Static AI compliance (no API keys) |
| `pnpm run test:coverage` | yes | Vitest with 80% global thresholds and 85% AI statements/lines/functions |
| `pnpm run verify:ai` | no | Optional extended AI regression |

`verify` never rewrites source files. Use `pnpm run format` and `pnpm run stylelint:fix` to apply fixes.

### Static promptfoo (`test:promptfoo`)

Uses the `echo` provider in [promptfooconfig.yaml](./promptfooconfig.yaml). **No API keys required.** Golden fixtures live in `tests/ai-golden/`.

### Optional `verify:ai`

See [docs/agent-environment.md](./docs/agent-environment.md#optional-verifyai) for its checks and environment requirements.

## Environment-specific notes

When working in Cursor Cloud or running `verify:ai`, consult [docs/agent-environment.md](./docs/agent-environment.md) for setup and environment-specific caveats.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
