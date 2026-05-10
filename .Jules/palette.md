## 2024-05-10 - Explicit ARIA Labels for Icon-Only Buttons in Tooltips
**Learning:** Icon-only buttons wrapped in `Tooltip` components do not automatically expose the tooltip content to screen readers. Relying solely on a parent tooltip component for accessibility is insufficient because the codebase pattern lacks native `aria-describedby` linking.
**Action:** When creating or maintaining icon-only buttons (even within Tooltips), explicitly add an `aria-label` attribute to the `<button>` element to ensure it is directly readable by assistive technologies.
