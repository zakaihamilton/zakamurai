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

- [Node.js](https://nodejs.org/) 22 (see [`.nvmrc`](./.nvmrc))
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
npm run test:e2e      # Chromium smoke e2e (basic + advanced)
npm run test:e2e:chromium # Alias for test:e2e
npm run test:visual   # Screenshot regression (Chromium + WebKit)
npm run test:visual:chromium # Screenshot regression on Chromium only
npm run build         # Production build
npm run perf          # Enforce the 500 KB per application-entry asset budget after a build
npm run audit         # Fail only on critical production dependency advisories
npm run verify        # Run all non-mutating local quality gates
npm run verify:ai     # Optional: local AI eval (promptfoo); not part of verify or CI
```

`verify` never rewrites source files. Formatting and CSS fixes are intentionally opt-in via
`format` and `stylelint:fix`. CI runs Chromium smoke e2e (`test:e2e`); screenshot regression
(`test:visual` / `test:visual:chromium`) remains available locally while WebKit host-level
browser dependencies are stabilized.

`verify:ai` runs `scripts/verify-ai.sh` for optional, local AI regression checks. It uses
[promptfoo](https://www.promptfoo.dev/) for semantic eval (`promptfooconfig.yaml`) and needs
provider API secrets (for example `OPENAI_API_KEY` for the configured OpenAI provider). It is
not included in `npm run verify` or CI. The script may also run an architectural drift scan when
`lucid` or `lucidshark` is installed on your PATH; that step is skipped with a warning if
neither command is available.

Knip exclusions are intentional: browser-only build/runtime dependencies (`almostnode`
and `esbuild-wasm`) and optional developer tooling (`fast-check` and `promptfoo`) are loaded
outside Knip's static application entrypoints.

Contributors working on React components should read [ARCHITECTURE.md](./ARCHITECTURE.md) before making changes. This project uses a custom proxy-based state system—not Redux, Zustand, or React Context for shared state.

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
