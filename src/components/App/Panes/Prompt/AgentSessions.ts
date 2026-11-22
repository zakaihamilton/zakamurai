import type { AgentSessionTreeRow } from '@/components/App/types';
import type {
  AgentSession,
  AgentSessionMessage,
  AgentSessionStateShape,
} from '@/types/domain-types';
import { createState } from 'triactor';
import {
  MAX_AGENT_SESSIONS,
  capSessionMessages,
  createAgentSession,
  createDefaultAgentSessions,
  getAgentSessionChildren,
  listAgentSessions,
} from './Session/sessionSerialization';

export * from './Session/sessionContextFormatting';
export * from './Session/sessionSerialization';

export const AgentSessionState = createState<AgentSessionStateShape>('AgentSessionState');

export function listAgentSessionTree(
  sessions: Record<string, AgentSession> = {},
): AgentSessionTreeRow[] {
  const rows: AgentSessionTreeRow[] = [];
  const visit = (parentId: string | null, depth: number, ancestors = new Set<string>()) => {
    for (const session of getAgentSessionChildren(sessions, parentId)) {
      if (ancestors.has(session.id)) continue;
      rows.push({ session, depth });
      visit(session.id, depth + 1, new Set([...ancestors, session.id]));
    }
  };
  visit(null, 0);
  return rows;
}

export function getActiveAgentSession(
  state: AgentSessionStateShape | null | undefined,
): AgentSession | null {
  if (!state?.sessions || !state.activeSessionId) return null;
  return state.sessions[state.activeSessionId] || null;
}

export function addAgentSession(
  state: AgentSessionStateShape | null | undefined,
  {
    name,
    mode: _mode = 'single',
    modelId = null,
    roleGraph: _roleGraph,
  }: {
    name?: string;
    mode?: 'single' | 'team' | string;
    modelId?: string | null;
    roleGraph?: unknown;
  } = {},
): AgentSessionStateShape {
  const sessions = { ...(state?.sessions || {}) };
  const existing = listAgentSessions(sessions);
  if (existing.length >= MAX_AGENT_SESSIONS) {
    throw new Error(`Maximum of ${MAX_AGENT_SESSIONS} agent sessions reached.`);
  }
  const nextIndex = existing.length + 1;
  const session = createAgentSession({
    name: name || `Session ${nextIndex}`,
    modelId,
  });
  sessions[session.id] = session;
  return { sessions, activeSessionId: session.id } satisfies AgentSessionStateShape;
}

export function createAgentBranch(
  state: AgentSessionStateShape | null | undefined,
  sessionId: string,
): AgentSessionStateShape {
  const sessions = { ...(state?.sessions || {}) };
  const source = sessions[sessionId];
  if (!source) throw new Error('Session not found');
  if (source.status === 'running') throw new Error('Stop the running agent before branching it.');
  if (listAgentSessions(sessions).length >= MAX_AGENT_SESSIONS) {
    throw new Error(`Maximum of ${MAX_AGENT_SESSIONS} agent sessions reached.`);
  }
  const branch = createAgentSession({
    name: `${source.name} branch`,
    parentId: source.id,
    modelId: source.modelId,
    messages: (source.messages || []).map((message) => ({ ...message })),
  });
  sessions[branch.id] = branch;
  return { sessions, activeSessionId: branch.id } satisfies AgentSessionStateShape;
}

export function renameAgentSession(
  state: AgentSessionStateShape | null | undefined,
  sessionId: string,
  name: string,
): AgentSessionStateShape {
  const sessions = { ...(state?.sessions || {}) };
  const session = sessions[sessionId];
  if (!session) throw new Error('Session not found');
  const nextName = (name || '').trim() || session.name;
  sessions[sessionId] = {
    ...session,
    name: nextName,
    updatedAt: Date.now(),
  };
  return { activeSessionId: state?.activeSessionId ?? null, ...state, sessions };
}

export function getAgentSessionSubtreeIds(
  sessions: Record<string, AgentSession>,
  sessionId: string,
): Set<string> {
  if (!sessions[sessionId]) return new Set();
  const ids = new Set([sessionId]);
  const visit = (parentId: string | null) => {
    for (const child of getAgentSessionChildren(sessions, parentId)) {
      if (ids.has(child.id)) continue;
      ids.add(child.id);
      visit(child.id);
    }
  };
  visit(sessionId);
  return ids;
}

export function deleteAgentSession(
  state: AgentSessionStateShape | null | undefined,
  sessionId: string,
): AgentSessionStateShape {
  const sessions = { ...(state?.sessions || {}) };
  const target = sessions[sessionId];
  if (!target) throw new Error('Session not found');
  const deletedIds = getAgentSessionSubtreeIds(sessions, sessionId);
  if ([...deletedIds].some((id) => sessions[id]?.status === 'running')) {
    throw new Error('Stop the running agent before deleting it.');
  }
  const remaining = listAgentSessions(sessions).filter((session) => !deletedIds.has(session.id));
  if (remaining.length === 0) {
    return createDefaultAgentSessions(target.modelId || null);
  }
  for (const id of deletedIds) delete sessions[id];
  const activeSessionId = deletedIds.has(state?.activeSessionId ?? '')
    ? target.parentId && sessions[target.parentId]
      ? target.parentId
      : getAgentSessionChildren(sessions, null)[0]?.id || remaining[0].id
    : (state?.activeSessionId ?? remaining[0].id);
  return { sessions, activeSessionId };
}

export function setActiveAgentSession(
  state: AgentSessionStateShape | null | undefined,
  sessionId: string,
): AgentSessionStateShape {
  if (!state?.sessions?.[sessionId]) throw new Error('Session not found');
  return { ...state, activeSessionId: sessionId };
}

export function updateAgentSession(
  state: AgentSessionStateShape | null | undefined,
  sessionId: string,
  patch: Partial<AgentSession>,
): AgentSessionStateShape {
  const sessions = { ...(state?.sessions || {}) };
  const session = sessions[sessionId];
  if (!session) throw new Error('Session not found');
  const next = {
    ...session,
    ...patch,
    mode: 'single' as const,
    updatedAt: Date.now(),
  };
  if (patch.messages) next.messages = capSessionMessages(patch.messages);
  // Legacy role graph patches are intentionally ignored by the manager runtime.
  if ('roleGraph' in patch) next.roleGraph = null;
  sessions[sessionId] = next;
  return { activeSessionId: state?.activeSessionId ?? null, ...state, sessions };
}

export function appendSessionMessage(
  state: AgentSessionStateShape | null | undefined,
  sessionId: string,
  message: AgentSessionMessage,
): AgentSessionStateShape {
  const sessions = { ...(state?.sessions || {}) };
  const session = sessions[sessionId];
  if (!session) throw new Error('Session not found');
  sessions[sessionId] = {
    ...session,
    messages: capSessionMessages([...(session.messages || []), message]),
    updatedAt: Date.now(),
  };
  return { activeSessionId: state?.activeSessionId ?? null, ...state, sessions };
}
