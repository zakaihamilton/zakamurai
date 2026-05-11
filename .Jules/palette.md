## 2024-05-18 - Missing native aria-describedby for icon-only buttons
**Learning:** Icon-only buttons wrapped in `Tooltip` components lack native `aria-describedby` linking in this codebase; they must explicitly include an `aria-label` attribute on the `<button>` element to ensure screen reader accessibility.
**Action:** Always add `aria-label` directly to `<button>` elements within `Tooltip` wrappers if the button does not contain visible text.
