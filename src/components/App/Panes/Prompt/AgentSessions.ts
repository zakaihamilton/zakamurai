import type { AgentSessionTreeRow, CreateAgentSessionOptions } from '@/components/App/types';
import { createState } from '@/components/state/State';
import type {
  AgentReasoningEntry,
  AgentRunUsage,
  AgentSession,
  AgentSessionMessage,
  AgentSessionStateShape,
} from '@/components/state/domain-types';

export const MAX_AGENT_SESSIONS = 50;
export const MAX_SESSION_MESSAGES = 40;
export const MAX_SESSION_CONTEXT_CHARACTERS = 12000;
/**
 * The transcript is rendered as Markdown and persisted while an agent runs.
 * Keep enough history to diagnose a full multi-role run while still bounding
 * persisted session size and Markdown rendering work.
 */
export const MAX_REASONING_EVENTS = 160;

export const createAgentRunUsage = (): AgentRunUsage => ({
  modelIds: [],
  modelCalls: 0,
  outcomes: { success: 0, error: 0, aborted: 0 },
  promptTokens: 0,
  promptTokenCalls: 0,
  completionTokens: 0,
  completionTokenCalls: 0,
  totalMs: 0,
  timeToFirstTokenMs: 0,
  timeToFirstTokenCalls: 0,
  decodeTokensPerSecond: 0,
  decodeTokensPerSecondCalls: 0,
  toolCalls: {},
});

export const MAX_STEP_IO_CHARACTERS = 24000;

export const clipReasoningStepIO = (value: string): string =>
  value.length > MAX_STEP_IO_CHARACTERS
    ? `${value.slice(0, MAX_STEP_IO_CHARACTERS)}\n…[truncated]`
    : value;

const formatStepIOBlock = (label: string, value: string): string => {
  const clipped = clipReasoningStepIO(value);
  let fence = '```';
  while (clipped.includes(fence)) fence += '`';
  return `**${label}**\n\n${fence}text\n${clipped}\n${fence}`;
};

/** Formats persisted reasoning events, optionally expanding model I/O blocks. */
export const formatReasoningEvents = (
  entries: AgentReasoningEntry[] = [],
  showStepIO = false,
): string =>
  entries
    .map((entry) => {
      const blocks = entry.text ? [entry.text] : [];
      if (showStepIO && (entry.input || entry.output)) {
        const step = entry.turn ? `Step ${entry.turn}` : 'Agent step';
        if (entry.input) blocks.push(formatStepIOBlock(`${step} input`, entry.input));
        if (entry.output) blocks.push(formatStepIOBlock(`${step} output`, entry.output));
      }
      return blocks.join('\n\n');
    })
    .filter(Boolean)
    .join('\n\n');

const CONTEXT_OMITTED_NOTICE = '[Earlier conversation omitted for length.]';

export const AgentSessionState = createState<AgentSessionStateShape>('AgentSessionState');

const normalizeReasoningEvents = (value: unknown): AgentReasoningEntry[] =>
  Array.isArray(value)
    ? value
        .filter(
          (entry): entry is AgentReasoningEntry =>
            Boolean(entry) &&
            typeof entry === 'object' &&
            typeof (entry as AgentReasoningEntry).text === 'string',
        )
        .map((entry) => ({
          text: entry.text,
          timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : '',
          ...(typeof entry.turn === 'number' ? { turn: entry.turn } : {}),
          ...(typeof entry.input === 'string' ? { input: clipReasoningStepIO(entry.input) } : {}),
          ...(typeof entry.output === 'string'
            ? { output: clipReasoningStepIO(entry.output) }
            : {}),
        }))
        .slice(-MAX_REASONING_EVENTS)
    : [];

const finiteNonNegative = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

const normalizeAgentRunUsage = (value: unknown): AgentRunUsage => {
  const usage = value && typeof value === 'object' ? (value as Partial<AgentRunUsage>) : {};
  const outcomes: Partial<AgentRunUsage['outcomes']> =
    usage.outcomes && typeof usage.outcomes === 'object' ? usage.outcomes : {};
  const toolCalls: Record<string, unknown> =
    usage.toolCalls && typeof usage.toolCalls === 'object' ? usage.toolCalls : {};
  return {
    modelIds: Array.isArray(usage.modelIds)
      ? [
          ...new Set(
            usage.modelIds.filter((id): id is string => typeof id === 'string' && Boolean(id)),
          ),
        ]
      : [],
    modelCalls: finiteNonNegative(usage.modelCalls),
    outcomes: {
      success: finiteNonNegative(outcomes.success),
      error: finiteNonNegative(outcomes.error),
      aborted: finiteNonNegative(outcomes.aborted),
    },
    promptTokens: finiteNonNegative(usage.promptTokens),
    promptTokenCalls: finiteNonNegative(usage.promptTokenCalls),
    completionTokens: finiteNonNegative(usage.completionTokens),
    completionTokenCalls: finiteNonNegative(usage.completionTokenCalls),
    totalMs: finiteNonNegative(usage.totalMs),
    timeToFirstTokenMs: finiteNonNegative(usage.timeToFirstTokenMs),
    timeToFirstTokenCalls: finiteNonNegative(usage.timeToFirstTokenCalls),
    decodeTokensPerSecond: finiteNonNegative(usage.decodeTokensPerSecond),
    decodeTokensPerSecondCalls: finiteNonNegative(usage.decodeTokensPerSecondCalls),
    toolCalls: Object.fromEntries(
      Object.entries(toolCalls).flatMap(([name, count]) =>
        typeof name === 'string' && finiteNonNegative(count) > 0
          ? [[name, finiteNonNegative(count)]]
          : [],
      ),
    ),
  };
};

export function createAgentSession({
  name,
  mode: _mode = 'single',
  modelId = null,
  roleGraph: _roleGraph = null,
  parentId = null,
  messages = [],
}: CreateAgentSessionOptions = {}): AgentSession {
  const now = Date.now();
  return {
    id: `session-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || 'Session 1',
    parentId: typeof parentId === 'string' ? parentId : null,
    createdAt: now,
    updatedAt: now,
    // Kept as a compatibility field for persisted clients; the manager never branches on it.
    mode: 'single',
    modelId: modelId || null,
    roleGraph: null,
    messages: capSessionMessages(messages),
    reasoning: '',
    reasoningEvents: [],
    showStepIO: false,
    runUsage: createAgentRunUsage(),
    status: 'idle',
  };
}

export function createDefaultAgentSessions(modelId: string | null = null): AgentSessionStateShape {
  const session = createAgentSession({ name: 'Session 1', modelId });
  return {
    sessions: { [session.id]: session },
    activeSessionId: session.id,
  };
}

export function createSessionMessage({
  role,
  text,
  agentRole = null,
}: {
  role: string;
  text: string;
  agentRole?: string | null;
}): AgentSessionMessage {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    role,
    text,
    timestamp: new Date().toTimeString().split(' ')[0],
    ...(agentRole ? { agentRole } : {}),
  };
}

export function listAgentSessions(sessions: Record<string, AgentSession> = {}): AgentSession[] {
  return Object.values(sessions).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function getAgentSessionChildren(
  sessions: Record<string, AgentSession> = {},
  parentId: string | null = null,
): AgentSession[] {
  return listAgentSessions(sessions).filter((session) => (session.parentId || null) === parentId);
}

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

export function capSessionMessages(messages: AgentSessionMessage[] = []): AgentSessionMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-MAX_SESSION_MESSAGES);
}

function normalizeSessionMessages(messages: unknown): AgentSessionMessage[] {
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

function normalizeParentIds(sessions: Record<string, AgentSession>): Record<string, AgentSession> {
  const normalized: Record<string, AgentSession> = {};
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
export function normalizeAgentSessions(
  raw: unknown,
  { modelId = null }: { modelId?: string | null } = {},
): AgentSessionStateShape {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createDefaultAgentSessions(modelId);
  }

  const sessionsIn =
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    'sessions' in raw &&
    (raw as { sessions?: unknown }).sessions &&
    typeof (raw as { sessions: unknown }).sessions === 'object'
      ? (raw as { sessions: Record<string, AgentSession> }).sessions
      : {};
  const normalized: Record<string, AgentSession> = {};
  for (const [id, session] of Object.entries(sessionsIn)) {
    if (!session || typeof session !== 'object') continue;
    const sessionId = typeof session.id === 'string' ? session.id : id;
    const messages = normalizeSessionMessages(session.messages);
    normalized[sessionId] = {
      id: sessionId,
      name: typeof session.name === 'string' && session.name.trim() ? session.name.trim() : 'Agent',
      parentId: typeof session.parentId === 'string' ? session.parentId : null,
      createdAt: Number.isFinite(session.createdAt) ? session.createdAt : Date.now(),
      updatedAt: Number.isFinite(session.updatedAt) ? session.updatedAt : Date.now(),
      mode: 'single',
      modelId: typeof session.modelId === 'string' ? session.modelId : null,
      roleGraph: null,
      messages,
      reasoning: typeof session.reasoning === 'string' ? session.reasoning : '',
      reasoningEvents: normalizeReasoningEvents(session.reasoningEvents),
      showStepIO: session.showStepIO === true,
      runUsage: normalizeAgentRunUsage(session.runUsage),
      status: 'idle',
    };
  }

  const ordered = listAgentSessions(normalized).slice(0, MAX_AGENT_SESSIONS);
  if (ordered.length === 0) return createDefaultAgentSessions(modelId);

  const sessions = normalizeParentIds(
    Object.fromEntries(ordered.map((session) => [session.id, session])),
  );
  const activeSessionId =
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    'activeSessionId' in raw &&
    typeof (raw as { activeSessionId?: unknown }).activeSessionId === 'string' &&
    sessions[(raw as { activeSessionId: string }).activeSessionId]
      ? (raw as { activeSessionId: string }).activeSessionId
      : ordered[0].id;

  return { sessions, activeSessionId };
}

export function serializeAgentSessions(state: AgentSessionStateShape | null | undefined) {
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
          modelId: session.modelId,
          messages: capSessionMessages(session.messages),
          reasoning: session.reasoning || '',
          reasoningEvents: normalizeReasoningEvents(session.reasoningEvents),
          showStepIO: session.showStepIO === true,
          runUsage: normalizeAgentRunUsage(session.runUsage),
        },
      ]),
    ),
  };
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

function formatContextMessage(message: AgentSessionMessage): string {
  const role = message.role === 'user' ? 'User' : message.role === 'ai' ? 'Agent' : 'System';
  return `${role}: ${message.text}`;
}

export function formatSessionContext(
  messages: AgentSessionMessage[] = [],
  maxCharacters: number = MAX_SESSION_CONTEXT_CHARACTERS,
): string {
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
