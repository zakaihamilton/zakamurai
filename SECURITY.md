# Security Policy

## Supported versions

Zakamurai is a browser-local IDE. Report issues against the current `main` branch and the production site at [zakamurai.com](https://www.zakamurai.com).

## Threat model

- **IDE origin** holds project files, IndexedDB/localStorage, settings, and AI session state.
- **Preview origin** runs user project JavaScript. Configured production deployments isolate this on a separate origin (`NEXT_PUBLIC_IDE_ORIGIN` / `NEXT_PUBLIC_PREVIEW_ORIGIN`).
- **Direct `*.vercel.app` deployment URLs** fail closed; open the IDE through its configured domain to run previews on the separate preview origin. **`pnpm run dev:same-origin`** is an explicit local-only compatibility mode that shares cookies, storage, and DOM with the IDE and is **not** origin isolation. `pnpm run dev` starts an isolated preview proxy on port 3001.

Preview MessagePort handshakes require a matching origin, session ID, and protocol version. Error and reconnect `postMessage` calls target the IDE origin only (never `*`).

AI edits are restricted to project-relative paths. Absolute paths, `..` traversal, and duplicate targets are rejected before staging. Workspace file bodies are still concatenated into model prompts; validators are the path-safety control, not prompt isolation.

In-browser compiles (almostnode / esbuild-wasm) are not an OS sandbox. Isolation of user code from the IDE depends on the preview origin configuration above; deployments without that configuration cannot run project previews.

## Reporting a vulnerability

Please open a [GitHub security advisory](https://github.com/zakaihamilton/zakamurai/security/advisories/new) on this repository. Do not file a public issue for exploitable preview-isolation or storage-access bugs.

Include the affected origin configuration (isolated or explicit local same-origin), browser, and a minimal reproduction when possible.
