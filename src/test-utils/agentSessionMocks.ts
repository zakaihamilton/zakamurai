import type { AgentSession, AgentSessionStateShape } from '@/components/state/domain-types';
import type { RoleGraph } from '@/components/AI/types';

/** Assert an agent session exists in tests. */
export function expectAgentSession(
  state: AgentSessionStateShape | null | undefined,
): AgentSession {
  const session = state?.activeSessionId ? state.sessions[state.activeSessionId] : null;
  if (!session) throw new Error('Expected active agent session');
  return session;
}

/** Assert a session id is non-null in tests. */
export function requireSessionId(id: string | null | undefined): string {
  if (!id) throw new Error('Expected session id');
  return id;
}

/** Cast role graph from session for test assertions. */
export function sessionRoleGraph(session: AgentSession): RoleGraph {
  return session.roleGraph as RoleGraph;
}
