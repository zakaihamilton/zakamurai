## 2024-05-11 - SSR Compatible DOM Sanitization
**Vulnerability:** XSS risk in `CodeEditor.js` where user input was rendered via `dangerouslySetInnerHTML` without sanitization.
**Learning:** Using the standard `dompurify` package in a Next.js (SSR) application causes a server crash because it relies on the browser's `window` object, which is undefined during SSR.
**Prevention:** Always use `isomorphic-dompurify` in Next.js or other SSR React environments when sanitizing HTML before using `dangerouslySetInnerHTML`.
