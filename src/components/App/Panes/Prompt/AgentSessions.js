import { createState } from '@/components/state/State';

export const MAX_AGENT_SESSIONS = 10;
export const MAX_SESSION_MESSAGES = 40;

export const AgentSessionState = createState('AgentSessionState');

export function createAgentSession({ name, mode = 'single', modelId = null } = {}) {
  const now = Date.now();
  return {
    id: `session-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || 'Agent 1',
    createdAt: now,
    updatedAt: now,
    mode: mode === 'team' ? 'team' : 'single',
    modelId: modelId || null,
    messages: [],
    reasoning: '',
    status: 'idle',
  };
}

export function createDefaultAgentSessions(modelId = null) {
  const session = createAgentSession({ name: 'Agent 1', modelId });
  return {
    sessions: { [session.id]: session },
    activeSessionId: session.id,
  };
}

export function createSessionMessage({ role, text, agentRole = null }) {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    role,
    text,
    timestamp: new Date().toTimeString().split(' ')[0],
    ...(agentRole ? { agentRole } : {}),
  };
}

export function listAgentSessions(sessions = {}) {
  return Object.values(sessions).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function getActiveAgentSession(state) {
  if (!state?.sessions || !state.activeSessionId) return null;
  return state.sessions[state.activeSessionId] || null;
}

export function capSessionMessages(messages = []) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-MAX_SESSION_MESSAGES);
}

/**
 * Normalize persisted session payload into a safe in-memory store shape.
 */
export function normalizeAgentSessions(raw, { modelId = null } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createDefaultAgentSessions(modelId);
  }

  const sessionsIn = raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {};
  const normalized = {};
  for (const [id, session] of Object.entries(sessionsIn)) {
    if (!session || typeof session !== 'object') continue;
    const sessionId = typeof session.id === 'string' ? session.id : id;
    const mode = session.mode === 'team' ? 'team' : 'single';
    const messages = Array.isArray(session.messages)
      ? capSessionMessages(
          session.messages
            .filter((msg) => msg && typeof msg === 'object' && typeof msg.text === 'string')
            .map((msg) => ({
              id: typeof msg.id === 'number' ? msg.id : Date.now(),
              role: ['user', 'ai', 'system'].includes(msg.role) ? msg.role : 'system',
              text: msg.text,
              timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : undefined,
              ...(msg.agentRole ? { agentRole: String(msg.agentRole) } : {}),
            })),
        )
      : [];
    normalized[sessionId] = {
      id: sessionId,
      name: typeof session.name === 'string' && session.name.trim() ? session.name.trim() : 'Agent',
      createdAt: Number.isFinite(session.createdAt) ? session.createdAt : Date.now(),
      updatedAt: Number.isFinite(session.updatedAt) ? session.updatedAt : Date.now(),
      mode,
      modelId: typeof session.modelId === 'string' ? session.modelId : null,
      messages,
      reasoning: typeof session.reasoning === 'string' ? session.reasoning : '',
      status: 'idle',
    };
  }

  const ordered = listAgentSessions(normalized).slice(0, MAX_AGENT_SESSIONS);
  if (ordered.length === 0) return createDefaultAgentSessions(modelId);

  const sessions = Object.fromEntries(ordered.map((session) => [session.id, session]));
  const activeSessionId =
    typeof raw.activeSessionId === 'string' && sessions[raw.activeSessionId]
      ? raw.activeSessionId
      : ordered[0].id;

  return { sessions, activeSessionId };
}

export function serializeAgentSessions(state) {
  const normalized = normalizeAgentSessions(state);
  return {
    activeSessionId: normalized.activeSessionId,
    sessions: Object.fromEntries(
      listAgentSessions(normalized.sessions).map((session) => [
        session.id,
        {
          id: session.id,
          name: session.name,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          mode: session.mode,
          modelId: session.modelId,
          messages: capSessionMessages(session.messages),
          reasoning: session.reasoning || '',
        },
      ]),
    ),
  };
}

export function addAgentSession(state, { name, mode = 'single', modelId = null } = {}) {
  const sessions = { ...(state?.sessions || {}) };
  const existing = listAgentSessions(sessions);
  if (existing.length >= MAX_AGENT_SESSIONS) {
    throw new Error(`Maximum of ${MAX_AGENT_SESSIONS} agent sessions reached.`);
  }
  const nextIndex = existing.length + 1;
  const session = createAgentSession({
    name: name || `Agent ${nextIndex}`,
    mode,
    modelId,
  });
  sessions[session.id] = session;
  return { sessions, activeSessionId: session.id };
}

export function renameAgentSession(state, sessionId, name) {
  const sessions = { ...(state?.sessions || {}) };
  const session = sessions[sessionId];
  if (!session) throw new Error('Session not found');
  const nextName = (name || '').trim() || session.name;
  sessions[sessionId] = {
    ...session,
    name: nextName,
    updatedAt: Date.now(),
  };
  return { ...state, sessions };
}

export function deleteAgentSession(state, sessionId) {
  const sessions = { ...(state?.sessions || {}) };
  if (!sessions[sessionId]) throw new Error('Session not found');
  const remaining = listAgentSessions(sessions).filter((session) => session.id !== sessionId);
  if (remaining.length === 0) {
    return createDefaultAgentSessions(sessions[sessionId]?.modelId || null);
  }
  delete sessions[sessionId];
  const activeSessionId =
    state.activeSessionId === sessionId
      ? remaining[remaining.length - 1].id
      : state.activeSessionId;
  return { sessions, activeSessionId };
}

export function setActiveAgentSession(state, sessionId) {
  if (!state?.sessions?.[sessionId]) throw new Error('Session not found');
  return { ...state, activeSessionId: sessionId };
}

export function updateAgentSession(state, sessionId, patch) {
  const sessions = { ...(state?.sessions || {}) };
  const session = sessions[sessionId];
  if (!session) throw new Error('Session not found');
  const next = {
    ...session,
    ...patch,
    updatedAt: Date.now(),
  };
  if (patch.messages) next.messages = capSessionMessages(patch.messages);
  sessions[sessionId] = next;
  return { ...state, sessions };
}

export function appendSessionMessage(state, sessionId, message) {
  const sessions = { ...(state?.sessions || {}) };
  const session = sessions[sessionId];
  if (!session) throw new Error('Session not found');
  sessions[sessionId] = {
    ...session,
    messages: capSessionMessages([...(session.messages || []), message]),
    updatedAt: Date.now(),
  };
  return { ...state, sessions };
}
