import type { AgentSession, AgentSessionStateShape } from '@/types/domain-types';

/** Build a minimal AgentSession fixture for tests. */
export function makeAgentSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'session-1',
    name: 'Test Session',
    parentId: null,
    createdAt: 0,
    updatedAt: 0,
    mode: 'single',
    modelId: null,
    roleGraph: null,
    messages: [],
    reasoning: '',
    status: 'idle',
    ...overrides,
  };
}

/** Assert an agent session exists in tests. */
export function expectAgentSession(state: AgentSessionStateShape | null | undefined): AgentSession {
  const session = state?.activeSessionId ? state.sessions[state.activeSessionId] : null;
  if (!session) throw new Error('Expected active agent session');
  return session;
}

/** Assert a session id is non-null in tests. */
export function requireSessionId(id: string | null | undefined): string {
  if (!id) throw new Error('Expected session id');
  return id;
}

/** Assert a single agent session is defined in tests. */
export function requireActiveSession(session: AgentSession | null | undefined): AgentSession {
  if (!session) throw new Error('Expected active session');
  return session;
}

/** Cast role graph from session for test assertions. */
