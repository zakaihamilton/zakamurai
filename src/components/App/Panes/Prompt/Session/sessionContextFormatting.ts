import type { AgentReasoningEntry, AgentSession, AgentSessionMessage } from '@/types/domain-types';

export const MAX_SESSION_CONTEXT_CHARACTERS = 12000;
/**
 * The transcript is rendered as Markdown and persisted while an agent runs.
 * Keep enough history to diagnose a full multi-role run while still bounding
 * persisted session size and Markdown rendering work.
 */
export const MAX_REASONING_EVENTS = 160;
export const MAX_STEP_IO_CHARACTERS = 24000;

const CONTEXT_OMITTED_NOTICE = '[Earlier conversation omitted for length.]';
const MANAGER_ERROR_PREFIX = /^AI Manager error:\s*/i;

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

export function isManagerErrorMessage(text: string): boolean {
  return MANAGER_ERROR_PREFIX.test(text);
}

/** Latest manager failure for Progress & Reasoning, when the session is not running. */
export function getLatestManagerError(
  session: Pick<AgentSession, 'status' | 'messages'> | null | undefined,
): string | undefined {
  if (!session || session.status === 'running' || session.status !== 'error') return undefined;
  const message = [...(session.messages || [])]
    .reverse()
    .find((entry) => entry.role === 'ai' && isManagerErrorMessage(entry.text));
  return message?.text.replace(MANAGER_ERROR_PREFIX, '') || undefined;
}

export function withoutManagerErrorMessages(
  messages: AgentSessionMessage[] = [],
): AgentSessionMessage[] {
  return messages.filter(
    (message) => !(message.role === 'ai' && isManagerErrorMessage(message.text)),
  );
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
