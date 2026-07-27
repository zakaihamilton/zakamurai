## Summary

<!-- What changed and why? -->

## Test plan

- [ ] `npm run verify` passes locally
- [ ] `npm run check:architecture` passes (if touching `src/components/`)
- [ ] `npm run test:promptfoo` passes (if touching AI prompts, parsers, or golden fixtures)
- [ ] Added/updated unit tests for behavior changes
- [ ] Read [ARCHITECTURE.md](../ARCHITECTURE.md) if changing state, preview, or AI pipeline

## AI-assisted changes

- [ ] Changes follow proxy state rules (no domain `useState`)
- [ ] UI uses CSS Modules (no Tailwind / inline styles in module components)
- [ ] AI edit paths are project-relative and validated
