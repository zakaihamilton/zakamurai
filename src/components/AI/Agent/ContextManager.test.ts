import { describe, expect, it } from 'vitest';
import { AgentContextManager, formatVerificationResult } from './ContextManager';

describe('AgentContextManager', () => {
  it('keeps bounded structured evidence', () => {
    const context = new AgentContextManager({ request: 'fix app' });
    context.record('validation', { status: 'failed', diagnostics: 'src/a.js:3 boom' });
    expect(context.snapshot().text).toContain('[validation]');
    expect(context.snapshot().text).toContain('src/a.js:3');
  });

  it('clips oversized evidence and formats missing verification results', () => {
    const context = new AgentContextManager({ request: 'fix app', priorContext: 'handoff' });
    context.record('output', 'x'.repeat(2000));
    expect(context.snapshot().entries).toHaveLength(2);
    expect(context.toString()).toContain('…[truncated]');
    context.record('message', 'short');
    context.record('empty', '');
    expect(context.toString()).toContain('[message]');
    expect(formatVerificationResult()).toBe('Validation is unavailable.');
    expect(formatVerificationResult({ output: 'done', status: 'unavailable' })).toContain(
      '"status":"unavailable"',
    );
    expect(formatVerificationResult({ status: 'passed', diagnostics: '' })).toContain(
      '"diagnostics":""',
    );
  });

  it('supports custom context bounds', () => {
    const context = new AgentContextManager({
      request: 'test',
      maxContextChars: 100,
      maxItemChars: 20,
    });
    context.record('data', 'this is a long string that will get clipped');
    expect(context.toString()).toContain('…[truncated]');
    expect(context.toString().length).toBeLessThan(100);
  });
});
