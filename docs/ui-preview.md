# UI preview

Run `pnpm install`, then `pnpm run dev:ui-preview` and open <http://127.0.0.1:3217/ui-preview>. The server binds to loopback. The route returns 404 outside development and needs no account, project or model download. If file watching fails, run `WATCHPACK_POLLING=true pnpm exec next dev --webpack -H 127.0.0.1 -p 3217`.

The selectors update the URL, so a screen, scenario and theme can be shared with another local reviewer. Resize the browser to inspect different widths. Fixtures are fictional and reset when the screen or scenario changes. Close a dialog to access the selectors again.

| Screen | Production UI | Scenarios |
| --- | --- | --- |
| Welcome | Welcome page and prompt | Same welcome layout in each scenario |
| Workspace | Breadcrumb, build/view buttons, explorer, tab bar and editor header | Populated or empty explorer; error uses populated data |
| Editor | Code editor | Synthetic file or empty buffer; error uses populated data |
| Diff | Editor header and side-by-side review | Proposed change or no pending change; error uses populated data |
| Agent | Conversation, progress/reasoning and composer | Conversation, empty, or model error |
| Preview | Preview toolbar and empty/error views | Static sample page, unavailable, or build error |
| Logs | Log view | Successful build, empty, or compilation error |
| Instructions | Instructions page | Same page in each scenario |
| Models | AI model manager and settings | Cached model, uncached, or unavailable device/download error |
| Download | Model download confirmation dialog | Same confirmation in each scenario |
| Storage | Storage notification | Low storage, no notification, or save failure |

The gallery mounts these components in an isolated state root without the IDE's settings synchronization, filesystem bootstrap or background services. The model manager receives a synthetic capability report; recheck and cache actions are inert. Editor and diff changes exist only in memory. Welcome and agent submissions are stopped, gallery links are disabled, and build, preview, export and other service actions are simulated or inert. Clipboard buttons in production components can copy the synthetic fixture text. Closing and reopening a dialog works locally. The static preview sample does not execute project code, start a service worker, or change the production preview handshake.

The workspace is a composition of production components with a fixture shell, not a complete running IDE. Some controls such as file operations, navigation, formatting, search and build are inert; the model download confirmation reuses the production dialog. The gallery does not test real persistence, filesystem access, AI inference, model downloads, compilation or preview isolation. Use the normal application and end-to-end tests for those flows. Do not use this gallery as a security boundary or enter real data.

## Visual regression

The standard visual commands exercise the preview's workspace, diff, agent-error and preview-error fixtures in Chromium and WebKit. macOS baselines are checked in. Linux screenshot checks are temporarily skipped because Linux baselines have not yet been generated; the interaction and accessibility tests still run there. On a Linux CI-equivalent host, generate them with `UPDATE_UI_PREVIEW_SNAPSHOTS=1 pnpm exec playwright test tests/visual/ui-preview.spec.ts --update-snapshots=all`, review the images, remove the platform skip, and rerun without the update flag.
