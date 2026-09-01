import type { ManagerEvent } from '@/components/AI/types';
import type { AgentChange, AgentEvent } from '@/components/AI/types';
import type { AgentEventFormatter } from '../prompt-types';

const quoteDetail = (value: string): string => `\`${value.replaceAll('`', '\\`')}\``;

const summarizeDetail = (value: string, maxCharacters = 240): string =>
  value.length > maxCharacters ? `${value.slice(0, maxCharacters)}…` : value;

const isHostAssistContext = (message: string): boolean => /^Host assistance:/.test(message);

const changedPaths = (changes: AgentChange[] = []): string[] => [
  ...new Set(
    changes
      .map((change) => change.path || change.filePath)
      .filter((path): path is string => Boolean(path)),
  ),
];

const formatFinishedLine = (
  message: string | undefined,
  changes: AgentChange[] | undefined,
  rolePrefix = '',
): string => {
  const paths = changedPaths(changes);
  return `${rolePrefix}**Ready for review:** ${message || 'Agent finished.'}${
    paths.length
      ? `\n\n**Changed files (${paths.length}):** ${paths.map(quoteDetail).join(', ')}`
      : ''
  }`;
};

export const formatAgentEvent: AgentEventFormatter = (event) => {
  const managerEvent = event as ManagerEvent;
  const legacy = event as AgentEvent;
  if (legacy.type === 'finished' || managerEvent.type === 'finished') {
    const role = legacy.agentRole ? `**${legacy.agentRole}** · ` : '';
    return formatFinishedLine(
      legacy.message || managerEvent.message,
      legacy.changes ?? managerEvent.changes,
      role,
    );
  }
  if (legacy.agentRole || legacy.action != null) {
    const role = legacy.agentRole ? `**${legacy.agentRole}** · ` : '';
    if (legacy.type === 'thinking')
      return `${role}**Step ${legacy.turn}:** ${legacy.message || 'thinking…'}`;
    if (legacy.type === 'tool') {
      const action =
        typeof legacy.action === 'string' ? legacy.action : legacy.action?.action || '';
      return `${role}**Step ${legacy.turn}:** \`${action}\``;
    }
    if (legacy.type === 'observation') {
      const action =
        typeof legacy.action === 'string' ? legacy.action : legacy.action?.action || '';
      return `${role}\`${action}\` ${legacy.error ? 'failed' : 'completed'}${legacy.message ? ` — ${legacy.message}` : ''}`;
    }
  }
  if (managerEvent.type === 'routing') {
    return `**Routing:** ${managerEvent.message || 'The manager is classifying the request.'}`;
  }
  if (managerEvent.type === 'tool') {
    return `**Tool:** \`${managerEvent.tool || 'workspace'}\` — ${managerEvent.message || 'completed'}`;
  }
  if (managerEvent.type === 'context') {
    const message = managerEvent.message || 'Workspace context updated.';
    return `**Context:** ${isHostAssistContext(message) ? message : summarizeDetail(message)}`;
  }
  if (managerEvent.type === 'model') {
    return `**Model:** ${managerEvent.message || 'The model is working.'}`;
  }
  if (managerEvent.type === 'validation') {
    return `**Validation:** ${managerEvent.message || 'Checking the proposed changes.'}`;
  }
  return legacy.message || '';
};
