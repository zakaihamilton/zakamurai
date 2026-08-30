# Security Policy

## Supported versions

Zakamurai is a browser-local IDE. Report issues against the current `main` branch and the production site at [zakamurai.com](https://www.zakamurai.com).

## Threat model

- **IDE origin** holds project files, IndexedDB/localStorage, settings, and AI session state.
- **Preview origin** runs user project JavaScript. Configured production deployments isolate this on a separate origin (`NEXT_PUBLIC_IDE_ORIGIN` / `NEXT_PUBLIC_PREVIEW_ORIGIN`).
- **Unconfigured `*.vercel.app` deployments** use a same-origin `/__preview/` compatibility surface. That fallback shares cookies, storage, and DOM with the IDE and is **not** origin isolation. Set both origin env vars for production.

Preview MessagePort handshakes require a matching origin, session ID, and protocol version. Error and reconnect `postMessage` calls target the IDE origin only (never `*`).

AI edits are restricted to project-relative paths. Absolute paths, `..` traversal, and duplicate targets are rejected before staging. Workspace file bodies are still concatenated into model prompts; validators are the path-safety control, not prompt isolation.

In-browser compiles (almostnode / esbuild-wasm) are not an OS sandbox. Isolation of user code from the IDE depends on the preview origin configuration above.

## Reporting a vulnerability

Please open a [GitHub security advisory](https://github.com/zakaihamilton/zakamurai/security/advisories/new) on this repository. Do not file a public issue for exploitable preview-isolation or storage-access bugs.

Include the affected origin configuration (isolated vs `/__preview/` fallback), browser, and a minimal reproduction when possible.
