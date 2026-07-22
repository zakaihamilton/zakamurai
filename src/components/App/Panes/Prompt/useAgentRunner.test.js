import { describe, expect, it } from 'vitest';
import { formatAgentEvent } from './useAgentRunner';

describe('formatAgentEvent', () => {
  it('formats thinking, tool, observation, and finished events', () => {
    expect(formatAgentEvent({ type: 'thinking', turn: 1, agentRole: 'planner' })).toContain(
      'Planner',
    );
    expect(
      formatAgentEvent({
        type: 'tool',
        turn: 2,
        agentRole: 'coder',
        action: { action: 'read_file', path: 'a.js' },
      }),
    ).toContain('read_file');
    expect(formatAgentEvent({ type: 'observation', message: 'ok', agentRole: 'coder' })).toContain(
      'ok',
    );
    expect(formatAgentEvent({ type: 'observation', message: 'bad', error: true })).toContain('⚠');
    expect(
      formatAgentEvent({ type: 'finished', message: 'done', agentRole: 'reviewer' }),
    ).toContain('Ready for review');
    expect(formatAgentEvent({ type: 'unknown' })).toBe('');
  });

  it('prefers custom role labels from the graph map', () => {
    expect(
      formatAgentEvent({ type: 'thinking', turn: 1, agentRole: 'r1' }, { r1: 'Lead' }),
    ).toContain('Lead');
  });
});
