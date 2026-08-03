# Zakamurai

Your AI coding workspace in the browser.

Zakamurai is a browser-based IDE built for editing, AI-assisted changes, in-browser builds, logs, and live preview. Open it, start coding, and skip the local setup.

## Features

- **File explorer & editor** — Manage HTML, CSS, JavaScript, and JSON files with syntax highlighting, smart formatting, and automatic saves to browser local storage.
- **AI collaboration** — Prompt an integrated AI that understands your project context. Review suggested changes in a side-by-side diff before applying them. Models run locally in the browser via WebLLM for a private, fast experience.
- **Build & preview** — Compile projects directly in the browser using [almostnode](https://www.npmjs.com/package/almostnode), a virtual Node.js-like environment. Preview the result and inspect build or runtime output in the logs panel.
- **Focused workflow** — Tabbed workspace, light/dark themes, keyboard shortcuts, CSS/JS navigation, and project export as a ZIP.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 24 (see [`.nvmrc`](./.nvmrc))
- npm

### Run locally

```bash
git clone https://github.com/zakaihamilton/zakamurai.git
cd zakamurai
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The `postinstall`, `predev`, and `prebuild` scripts copy almostnode and ONNX Runtime Web assets into `public/` automatically.

### Browser storage and recovery

Zakamurai stores projects locally in IndexedDB and falls back to browser localStorage when
IndexedDB is unavailable. If both stores cannot accept a write (for example, because quota is
exhausted), the open workspace remains available in memory and the app offers an immediate ZIP
export. Export before closing the tab in that state. The File System Access API is optional and
available only in compatible browsers.

### Isolated preview development

Run `npm run dev:isolated` to start the IDE at `http://localhost:3000` and the
preview runtime at `http://localhost:3001`. The preview executes user projects in
the browser on the second origin; it never receives same-origin access to the IDE.

For production, configure these Vercel environment variables and attach both domains
to the same Vercel project:

```bash
NEXT_PUBLIC_IDE_ORIGIN=https://www.zakamurai.com
NEXT_PUBLIC_PREVIEW_ORIGIN=https://preview.zakamurai.com
```

Add `preview.zakamurai.com` in **Project Settings → Domains** and create the CNAME
record Vercel provides. The preview subdomain must not redirect to `www`.

The preview must remain on a different origin from the IDE. Its handshake accepts only the active
iframe, configured origin, and current session; missing or matching origins show a setup error
rather than falling back to same-origin execution.

### Production build

```bash
npm run build
npm start
```

## Usage

1. **Explore** — Use the file explorer on the left to create, rename, and open files.
2. **Prompt** — Toggle the AI sidebar with `Ctrl+J` (or the top bar button) to ask questions or request changes.
3. **Build** — Press `Cmd+Enter` (Mac) or click **Build** in the top bar.
4. **Preview** — After a successful build, the Preview tab opens with your running app.

Press `?` in the app to view the full keyboard shortcut reference.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| App framework | [Next.js](https://nextjs.org/) 16, [React](https://react.dev/) 19 |
| Styling | CSS Modules |
| In-browser build | [almostnode](https://www.npmjs.com/package/almostnode) |
| Local AI | [WebLLM](https://webllm.mlc.ai/) (`@mlc-ai/web-llm`), WebAssembly |
| State | Custom hierarchical proxy-based state (see [ARCHITECTURE.md](./ARCHITECTURE.md)) |
| Tooling | [Biome](https://biomejs.dev/), [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/) |

Browser builds support package scripts parsed as shell-free commands joined with `&&`; pipes,
redirects, and other shell constructs are intentionally rejected. The browser runtime supports the
bundled TypeScript, Rollup, and esbuild paths plus browser-oriented bundling.

## Development

```bash
npm run lint          # Biome lint check
npm run format:check  # Verify formatting without changing files
npm run format        # Apply Biome formatting changes
npm run stylelint     # Check CSS
npm run stylelint:fix # Apply CSS lint fixes
npm run deadcode      # Check unused files and dependencies (Knip)
npm run test          # Unit tests (Vitest)
npm run test:watch    # Vitest in watch mode
npm run test:coverage # Unit tests with coverage thresholds
npm run test:ai-manager # Focused manager, replay, trace, and prompt-runner tests
npm run test:ai-manager:watch # Watch the focused manager suite while debugging
npm run test:ai-manager:replay # Replay deterministic JSON manager fixtures
npm run test:ai-manager:smoke # Opt-in real WebLLM manager smoke test
npm run test:promptfoo # Static AI compliance eval (no API keys)
npm run test:ai-soak # Mocked 200-request AI lifecycle and cleanup regression
npm run analyze:ai -- report.json # Summarize AI metrics from an exported support report
npm run check:architecture # Enforce component architecture rules
npm run test:e2e      # Chromium smoke e2e (basic + advanced)
npm run test:e2e:chromium # Alias for test:e2e
npm run test:visual   # Screenshot regression (Chromium + WebKit)
npm run test:visual:chromium # Screenshot regression on Chromium only
npm run build         # Production build
npm run perf          # Enforce the 500 KB per application-entry asset budget after a build
npm run audit         # Fail only on critical production dependency advisories
npm run verify        # Run all non-mutating local quality gates (matches CI)
npm run verify:ai     # Optional: extended local AI regression (lucid + full visual)
```

`verify` never rewrites source files. Formatting and CSS fixes are intentionally opt-in via
`format` and `stylelint:fix`. CI and `verify` run architecture checks, static promptfoo eval,
Chromium smoke e2e (`test:e2e`), isolated preview security tests (`test:e2e:isolated`), Chromium
visual regression (`test:visual:chromium`), and dependency audit. Full screenshot regression
across browsers (`test:visual`, including WebKit) remains available locally while WebKit
host-level browser dependencies are stabilized.

`verify:ai` runs [scripts/verify-ai.sh](./scripts/verify-ai.sh) for optional extended checks:
architectural drift scan when `lucid` or `lucidshark` is on PATH, the AI lifecycle soak, promptfoo
eval, performance budget, and full visual regression. Install lucidshark separately to enable the
drift scan. For physical-device validation, follow the
[AI memory profiling workflow](./docs/ai-memory-profiling.md).

Static `npm run test:promptfoo` uses the `echo` provider in [promptfooconfig.yaml](./promptfooconfig.yaml)
and golden fixtures in `tests/ai-golden/` — **no API keys required**. It is included in `verify` and CI.

The AI Manager has a fast deterministic debugging loop. Add or update a versioned fixture under
`tests/ai-manager/fixtures/`, then run `npm run test:ai-manager:replay` to exercise the real manager
and deterministic tools without loading WebLLM. During development, the Manager debug trace is
available in non-production builds and can be exported as JSON from the prompt pane. The trace
contains clipped and redacted inputs/outputs, routing/tool/model/validation events, timings, and
structured error codes. Run `npm run test:ai-manager:smoke` only when validating the browser’s real
WebLLM integration; set `ZAKAMURAI_AI_MODEL` to override the model.

When an AI run fails, the prompt header and More actions menu expose **Export AI incident**. The
incident bundle is local and metadata-only: it includes WebLLM timing,
recovery, browser/model state, Manager protocol status, and staged-change information, but excludes
workspace files, full prompts, and model output. Analyze an exported incident with
`npm run analyze:ai -- incident.json`.

Knip exclusions are intentional: browser-only build/runtime dependencies (`almostnode`
and `esbuild-wasm`) and optional developer tooling (`fast-check` and `promptfoo`) are loaded
outside Knip's static application entrypoints.

Contributors working on React components should read [ARCHITECTURE.md](./ARCHITECTURE.md) before making changes. AI-assisted contributors should also read [AGENTS.md](./AGENTS.md) and [CONTRIBUTING.md](./CONTRIBUTING.md). This project uses a custom proxy-based state system—not Redux, Zustand, or React Context for shared state.

## Project Structure

```
src/
├── app/              # Next.js app router (layout, page, preview routes)
├── components/
│   ├── AI/           # WebLLM integration, prompts, diff processor
│   ├── App/          # IDE shell: editor, sidebar, preview, top bar
│   ├── state/        # Proxy state primitives (Node, Object, State)
│   ├── Storage/      # Settings, LocalFS, and initial project data
│   └── ui/           # Shared UI components
├── constants/        # Shared app constants
└── utils/            # Compiler, navigation, formatting, RAG helpers
```

## Author

**Zakai Hamilton**

- GitHub: [@zakaihamilton](https://github.com/zakaihamilton/zakamurai)
- LinkedIn: [zakai-hamilton](https://www.linkedin.com/in/zakai-hamilton)
