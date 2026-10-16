import { AgentContextLedger } from './AgentContextLedger';

const contextLedgers = new Map<string, AgentContextLedger>();

export function getAgentContextLedger(
  sessionId: string | undefined,
  modelId: string,
): AgentContextLedger | null {
  if (!sessionId) return null;
  const key = `${sessionId}:${modelId}`;
  const existing = contextLedgers.get(key);
  if (existing) return existing;
  const ledger = new AgentContextLedger(sessionId, modelId);
  contextLedgers.set(key, ledger);
  return ledger;
}

/** Remove the in-memory ledgers and per-tab handoffs for deleted sessions. */
export function clearAgentContextLedgers(sessionIds: Iterable<string>): number {
  const deletedIds = new Set(sessionIds);
  if (deletedIds.size === 0) return 0;
  const prefixes = [...deletedIds].map((sessionId) => `zakamurai-agent-ledger:${sessionId}:`);

  let removed = 0;
  for (const [key, ledger] of contextLedgers) {
    if (deletedIds.has(ledger.sessionId)) {
      contextLedgers.delete(key);
      removed += 1;
    }
  }

  try {
    if (typeof sessionStorage !== 'undefined') {
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index);
        if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
          sessionStorage.removeItem(key);
        }
      }
    }
  } catch {
    // Session storage is best-effort; deleting the in-memory cache still succeeds.
  }
  return removed;
}
