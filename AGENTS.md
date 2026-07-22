# AGENTS.md

## Cursor Cloud specific instructions

Zakamurai is a single Next.js 16 / React 19 app (no backend, no database). All
persistence, compilation, AI, and preview run in the browser. The only server
process is the Next.js dev server. Standard commands live in `README.md` and
`package.json` scripts; the notes below cover only non-obvious caveats.

### Running

- Dev server: `npm run dev` serves the IDE on `http://localhost:3000`.
- `predev`/`prebuild`/`postinstall` copy `almostnode` + ONNX/esbuild WASM assets
  into `public/` (`setup:almostnode`, `setup:wasm`). If `public/lib/almostnode`,
  `public/wasm`, or `public/esbuild` look empty, re-run `npm install` (or
  `npm run setup:almostnode && npm run setup:wasm`) rather than debugging Next.

### Known pre-existing failures (not environment issues)

- `npm run lint` (Biome) reports a few formatting diffs and `npm run test`
  (Vitest) has some failing specs (e.g. `TabState.usePassiveState is not a
  function` in `EditorArea`/`DiffHandler`). These reproduce on a clean checkout,
  so the baseline is not all-green — do not assume you broke something.

### Playwright / visual tests

- `postinstall` downloads Chromium + WebKit browsers, but Playwright prints a
  Linux host-requirements warning because some system libraries are missing.
  Browsers still download. Running `npm run test:visual` may require system
  browser deps (`npx playwright install-deps`, needs root/apt) before it works.

### Optional local AI eval

- `npm run verify:ai` is optional and not part of `verify`/CI. It runs
  promptfoo (needs provider API secrets) and may run `lucid`/`lucidshark` when
  installed; otherwise the architectural scan step is skipped.

### LocalFS

- `src/components/Storage/LocalFS.js` uses the File System Access API and
  IndexedDB in the browser. It is not available in all environments (for example
  headless CI or browsers without the API).
