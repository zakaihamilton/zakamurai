import { describe, expect, it } from 'vitest';
import { AgentContextManager } from './ContextManager';

describe('AgentContextManager', () => {
  it('keeps bounded structured evidence', () => {
    const context = new AgentContextManager({ request: 'fix app' });
    context.record('validation', { status: 'failed', diagnostics: 'src/a.js:3 boom' });
    expect(context.snapshot().text).toContain('[validation]');
    expect(context.snapshot().text).toContain('src/a.js:3');
  });
});
