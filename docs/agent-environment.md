# Agent environment notes

This page collects environment-specific setup and troubleshooting details. Use only the sections that apply to the current environment or task.

## Cursor Cloud

### Development server and runtime assets

- `pnpm run dev` starts the IDE at `http://localhost:3000` and an isolated preview proxy at `http://localhost:3001`. Use `pnpm run dev:same-origin` only when you need the weaker same-origin `/__preview/` surface.
- `predev`, `prebuild`, and `postinstall` copy `almostnode` plus ONNX/esbuild WASM assets into `public/` through `setup:almostnode` and `setup:wasm`. If `public/lib/almostnode`, `public/wasm`, or `public/esbuild` look empty, rerun `pnpm install` or `pnpm run setup:almostnode && pnpm run setup:wasm` before debugging Next.js.

### Validation caveats

- `pnpm run format:check` (Biome) may report formatting diffs on a clean checkout. Prefer `pnpm run format` when touching those files.
- In-browser Build/Preview uses the custom esbuild-wasm resolver in `src/utils/compiler/browser-bundler.tsx`. Object-shaped package `browser` maps (for example, react-dom) are applied through `applyBrowserRemap` and must not be treated as entry path strings.
- `postinstall` downloads Chromium and WebKit, but Playwright may warn that Linux system libraries are missing. `pnpm run test:visual` may need `pnpm exec playwright install-deps` with root/apt access.
- `src/components/Storage/LocalFS.tsx` uses the File System Access API and IndexedDB; it is unavailable in some environments, including headless CI and browsers without that API.

## Optional `verify:ai`

Run `pnpm run verify:ai` for the extended checks in [scripts/verify-ai.sh](../scripts/verify-ai.sh):

1. Architectural drift scan through `lucidshark` or `lucid` (skipped if neither is on PATH).
2. `promptfoo eval`.
3. Performance budget check.
4. Visual regression in Chromium and WebKit.

Install `lucidshark` and add it to PATH to enable the architectural scan.
