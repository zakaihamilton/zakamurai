import { createDefaultRoleGraph, normalizeRoleGraph } from '@/components/AI/Agent/Roles';
import { createState } from '@/components/state/State';

export const MAX_AGENT_SESSIONS = 50;
export const MAX_SESSION_MESSAGES = 40;
export const MAX_SESSION_CONTEXT_CHARACTERS = 12000;

const CONTEXT_OMITTED_NOTICE = '[Earlier conversation omitted for length.]';

export const AgentSessionState = createState('AgentSessionState');

export function createAgentSession({
  name,
  mode = 'single',
  modelId = null,
  roleGraph = null,
  parentId = null,
  messages = [],
} = {}) {
  const now = Date.now();
  return {
    id: `session-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || 'Agent 1',
    parentId: typeof parentId === 'string' ? parentId : null,
    createdAt: now,
    updatedAt: now,
    mode: mode === 'team' ? 'team' : 'single',
    modelId: modelId || null,
    roleGraph: normalizeRoleGraph(roleGraph || createDefaultRoleGraph()),
    messages: capSessionMessages(messages),
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

export function getAgentSessionChildren(sessions = {}, parentId = null) {
  return listAgentSessions(sessions).filter((session) => (session.parentId || null) === parentId);
}

export function listAgentSessionTree(sessions = {}) {
  const rows = [];
  const visit = (parentId, depth, ancestors = new Set()) => {
    for (const session of getAgentSessionChildren(sessions, parentId)) {
      if (ancestors.has(session.id)) continue;
      rows.push({ session, depth });
      visit(session.id, depth + 1, new Set([...ancestors, session.id]));
    }
  };
  visit(null, 0);
  return rows;
}

export function getActiveAgentSession(state) {
  if (!state?.sessions || !state.activeSessionId) return null;
  return state.sessions[state.activeSessionId] || null;
}

export function capSessionMessages(messages = []) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-MAX_SESSION_MESSAGES);
}

function normalizeSessionMessages(messages) {
  return Array.isArray(messages)
    ? capSessionMessages(
        messages
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
}

function normalizeParentIds(sessions) {
  const normalized = {};
  for (const session of Object.values(sessions)) {
    const requestedParentId = typeof session.parentId === 'string' ? session.parentId : null;
    let parentId = requestedParentId;
    let isValidParent = Boolean(parentId);
    const visited = new Set([session.id]);
    while (parentId) {
      const parent = sessions[parentId];
      if (!parent || visited.has(parentId)) {
        isValidParent = false;
        break;
      }
      visited.add(parentId);
      parentId = typeof parent.parentId === 'string' ? parent.parentId : null;
    }
    normalized[session.id] = { ...session, parentId: isValidParent ? requestedParentId : null };
  }
  return normalized;
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
    const messages = normalizeSessionMessages(session.messages);
    normalized[sessionId] = {
      id: sessionId,
      name: typeof session.name === 'string' && session.name.trim() ? session.name.trim() : 'Agent',
      parentId: typeof session.parentId === 'string' ? session.parentId : null,
      createdAt: Number.isFinite(session.createdAt) ? session.createdAt : Date.now(),
      updatedAt: Number.isFinite(session.updatedAt) ? session.updatedAt : Date.now(),
      mode,
      modelId: typeof session.modelId === 'string' ? session.modelId : null,
      roleGraph: normalizeRoleGraph(session.roleGraph),
      messages,
      reasoning: typeof session.reasoning === 'string' ? session.reasoning : '',
      status: 'idle',
    };
  }

  const ordered = listAgentSessions(normalized).slice(0, MAX_AGENT_SESSIONS);
  if (ordered.length === 0) return createDefaultAgentSessions(modelId);

  const sessions = normalizeParentIds(
    Object.fromEntries(ordered.map((session) => [session.id, session])),
  );
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
          parentId: session.parentId || null,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          mode: session.mode,
          modelId: session.modelId,
          roleGraph: normalizeRoleGraph(session.roleGraph),
          messages: capSessionMessages(session.messages),
          reasoning: session.reasoning || '',
        },
      ]),
    ),
  };
}

export function addAgentSession(state, { name, mode = 'single', modelId = null, roleGraph } = {}) {
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
    roleGraph,
  });
  sessions[session.id] = session;
  return { sessions, activeSessionId: session.id };
}

export function createAgentBranch(state, sessionId) {
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
    mode: source.mode,
    modelId: source.modelId,
    roleGraph: source.roleGraph,
    messages: (source.messages || []).map((message) => ({ ...message })),
  });
  sessions[branch.id] = branch;
  return { sessions, activeSessionId: branch.id };
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

export function getAgentSessionSubtreeIds(sessions, sessionId) {
  if (!sessions[sessionId]) return new Set();
  const ids = new Set([sessionId]);
  const visit = (parentId) => {
    for (const child of getAgentSessionChildren(sessions, parentId)) {
      if (ids.has(child.id)) continue;
      ids.add(child.id);
      visit(child.id);
    }
  };
  visit(sessionId);
  return ids;
}

export function deleteAgentSession(state, sessionId) {
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
  const activeSessionId = deletedIds.has(state.activeSessionId)
    ? target.parentId && sessions[target.parentId]
      ? target.parentId
      : getAgentSessionChildren(sessions, null)[0]?.id || remaining[0].id
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
  if (patch.roleGraph) next.roleGraph = normalizeRoleGraph(patch.roleGraph);
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

function formatContextMessage(message) {
  const role = message.role === 'user' ? 'User' : message.role === 'ai' ? 'Agent' : 'System';
  const roleLabel = message.agentRole ? `${role} (${message.agentRole})` : role;
  return `${roleLabel}: ${message.text}`;
}

export function formatSessionContext(
  messages = [],
  maxCharacters = MAX_SESSION_CONTEXT_CHARACTERS,
) {
  const limit = Math.max(0, Number(maxCharacters) || 0);
  if (!limit) return '';
  const reserve = CONTEXT_OMITTED_NOTICE.length + 2;
  const contentLimit = Math.max(0, limit - reserve);
  const selected = [];
  let used = 0;
  let omitted = false;

  for (const message of [...messages].reverse()) {
    if (!message || typeof message.text !== 'string') continue;
    const chunk = formatContextMessage(message);
    const separator = selected.length ? 2 : 0;
    if (chunk.length + separator <= contentLimit - used) {
      selected.unshift(chunk);
      used += chunk.length + separator;
      continue;
    }
    omitted = true;
    if (selected.length === 0 && contentLimit > 0) {
      const prefix = `${message.role === 'user' ? 'User' : message.role === 'ai' ? 'Agent' : 'System'}: `;
      const marker = '[Message truncated] ';
      const available = Math.max(0, contentLimit - prefix.length - marker.length);
      selected.unshift(`${prefix}${marker}${message.text.slice(-available)}`);
    }
    break;
  }

  const context = selected.join('\n\n');
  return omitted
    ? `${CONTEXT_OMITTED_NOTICE}\n\n${context}`.slice(0, limit)
    : context.slice(0, limit);
}
