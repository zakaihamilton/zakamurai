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

- [Node.js](https://nodejs.org/) (LTS recommended)
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
npm run lint          # Biome check
npm run format        # Biome format
npm run test          # Unit tests (Vitest)
npm run test:watch    # Vitest in watch mode
npm run test:visual   # Visual regression tests (Playwright)
npm run verify        # Lint + unit tests
```

Contributors working on React components should read [ARCHITECTURE.md](./ARCHITECTURE.md) before making changes. This project uses a custom proxy-based state system—not Redux, Zustand, or React Context for shared state.

## Project Structure

```
src/
├── app/              # Next.js app router (layout, page, preview routes)
├── components/
│   ├── AI/           # WebLLM integration, prompts, diff processor
│   ├── App/          # IDE shell: editor, sidebar, preview, top bar
│   ├── Core/         # Proxy state primitives (Node, Object, State)
│   ├── Storage/      # Settings and initial project data
│   └── Widgets/      # Shared UI components
└── utils/            # Compiler, navigation, formatting, RAG helpers
```

## Author

**Zakai Hamilton**

- GitHub: [@zakaihamilton](https://github.com/zakaihamilton/zakamurai)
- LinkedIn: [zakai-hamilton](https://www.linkedin.com/in/zakai-hamilton)
