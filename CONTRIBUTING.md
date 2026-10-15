# Contributing to Zakamurai

Thank you for contributing. This project is optimized for both human and AI-assisted development; please follow the architecture docs so automated checks stay green.

## Before you start

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) — especially proxy state and preview security.
2. Read [AGENTS.md](./AGENTS.md) if you use Cursor or other coding agents.
3. Use Node.js 24 as the baseline (see [.nvmrc](./.nvmrc)); the supported engine range is `>=24 <26`, and Node.js 25 is compatibility-tested in CI. Use pnpm 10.33.0 (`pnpm-lock.yaml`, pinned in `package.json`).

## Development workflow

```bash
pnpm install
pnpm run dev
```

## Quality checklist (PRs)

Run locally before opening a PR:

```bash
pnpm run verify
```

This runs formatting, linting, typecheck, knip, architecture checks, static promptfoo eval, AI evals, unit coverage, production build, application and generated-runtime performance budgets, Chromium and WebKit e2e smoke, isolated preview security tests, preview header checks, visual regression (Chromium), and dependency audit.

Optional extended AI checks:

```bash
pnpm run verify:ai
```

Requires promptfoo (installed via `pnpm install --frozen-lockfile`). lucidshark/lucid architectural scan runs when installed on PATH.

## Tests

| Command | Purpose |
| --- | --- |
| `pnpm run test` | Unit tests |
| `pnpm run typecheck` | TypeScript `--noEmit` |
| `pnpm run test:coverage` | Coverage with thresholds |
| `pnpm run test:promptfoo` | Static AI compliance (no API keys) |
| `pnpm run check:architecture` | Architecture rule scan |
| `pnpm run check:runtime-assets` | Generated browser runtime manifest and size check |
| `pnpm run test:e2e` | Playwright smoke |
| `pnpm run test:e2e:isolated` | Cross-origin preview security |

Pre-commit hooks run Biome and related Vitest tests on staged files.

## Code style

- Biome for JS/JSX formatting and lint (`pnpm run format`, `pnpm run lint`).
- Stylelint for CSS Modules (`pnpm run stylelint`).
- No Tailwind; CSS Modules for UI components.
- Proxy state for shared domain data — not Redux/Zustand/React Context stores.

## Pull requests

- Keep changes focused; match existing patterns in surrounding code.
- Add or update tests for behavior changes.
- Do not commit secrets or API keys.
- Fill out the PR template checklist.

## Questions

Open a GitHub issue or discussion on [zakamurai](https://github.com/zakaihamilton/zakamurai).
