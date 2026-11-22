import {
  createIdleAgentActivity,
  normalizeAgentActivity,
} from '@/components/AI/Agent/AgentActivity';
import type { CreateAgentSessionOptions } from '@/components/App/types';
import type {
  AgentReasoningEntry,
  AgentRunUsage,
  AgentSession,
  AgentSessionMessage,
  AgentSessionStateShape,
} from '@/types/domain-types';
import { MAX_REASONING_EVENTS, clipReasoningStepIO } from './sessionContextFormatting';

export const MAX_AGENT_SESSIONS = 50;
export const MAX_SESSION_MESSAGES = 40;

export const createAgentRunUsage = (): AgentRunUsage => ({
  modelIds: [],
  requestedModelIds: [],
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
  taskKinds: [],
  recoveryReasons: [],
  repairAttempts: 0,
  finalValidationStatus: 'unavailable',
});

export function capSessionMessages(messages: AgentSessionMessage[] = []): AgentSessionMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-MAX_SESSION_MESSAGES);
}

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
    activity: createIdleAgentActivity(),
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
    requestedModelIds: Array.isArray(usage.requestedModelIds)
      ? [...new Set(usage.requestedModelIds.filter((id): id is string => typeof id === 'string'))]
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
    taskKinds: Array.isArray(usage.taskKinds)
      ? [...new Set(usage.taskKinds.filter((kind): kind is string => typeof kind === 'string'))]
      : [],
    recoveryReasons: Array.isArray(usage.recoveryReasons)
      ? [
          ...new Set(
            usage.recoveryReasons.filter((reason): reason is string => typeof reason === 'string'),
          ),
        ]
      : [],
    repairAttempts: finiteNonNegative(usage.repairAttempts),
    finalValidationStatus:
      usage.finalValidationStatus === 'passed' || usage.finalValidationStatus === 'failed'
        ? usage.finalValidationStatus
        : 'unavailable',
  };
};

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
      activity: normalizeAgentActivity(session.activity) || createIdleAgentActivity(),
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
          activity: normalizeAgentActivity(session.activity) || createIdleAgentActivity(),
          showStepIO: session.showStepIO === true,
          runUsage: normalizeAgentRunUsage(session.runUsage),
        },
      ]),
    ),
  };
}
