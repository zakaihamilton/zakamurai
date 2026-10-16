import { beforeEach, describe, expect, it } from 'vitest';
import { clearAgentContextLedgers, getAgentContextLedger } from './AgentContextLedgerStore';

describe('AgentContextLedgerStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('clears every model ledger for deleted sessions and keeps unrelated sessions', () => {
    const deletedSmall = getAgentContextLedger('deleted-session', 'small-model');
    const deletedLarge = getAgentContextLedger('deleted-session', 'large-model');
    const deletedBranch = getAgentContextLedger('deleted-branch', 'small-model');
    const retained = getAgentContextLedger('retained-session', 'small-model');
    deletedSmall?.record('deleted small context');
    deletedLarge?.record('deleted large context');
    deletedBranch?.record('deleted branch context');
    retained?.record('retained context');

    expect(clearAgentContextLedgers(['deleted-session', 'deleted-branch'])).toBe(3);

    expect(sessionStorage.getItem('zakamurai-agent-ledger:deleted-session:small-model')).toBeNull();
    expect(sessionStorage.getItem('zakamurai-agent-ledger:deleted-session:large-model')).toBeNull();
    expect(sessionStorage.getItem('zakamurai-agent-ledger:deleted-branch:small-model')).toBeNull();
    expect(
      sessionStorage.getItem('zakamurai-agent-ledger:retained-session:small-model'),
    ).not.toBeNull();

    const recreated = getAgentContextLedger('deleted-session', 'small-model');
    expect(recreated).not.toBe(deletedSmall);
    expect(recreated?.summary()).toBe('');
    expect(getAgentContextLedger('retained-session', 'small-model')).toBe(retained);
    expect(retained?.summary()).toContain('retained context');
  });

  it('does nothing for an empty deletion set', () => {
    const retained = getAgentContextLedger('retained-only', 'model');
    retained?.record('keep me');

    expect(clearAgentContextLedgers([])).toBe(0);
    expect(getAgentContextLedger('retained-only', 'model')).toBe(retained);
    expect(retained?.summary()).toContain('keep me');
  });
});
