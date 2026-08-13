import type { AgentSession } from '@/types/domain-types';
import { formatReasoningEvents } from './AgentSessions';
import type { PromptActivityAreaProps } from './prompt-types';

type AgentPaneContentParams = Pick<PromptActivityAreaProps, 'selectedModelInfo'> & {
  activeSession: AgentSession | null;
  sessionReasoning: string;
  isModelDownloading: boolean;
  modelDownloadProgress: string;
};

export function getAgentPaneContent({
  activeSession,
  sessionReasoning,
  selectedModelInfo,
  isModelDownloading,
  modelDownloadProgress,
}: AgentPaneContentParams): string {
  const transcriptText = activeSession?.messages?.length
    ? activeSession.messages
        .map((message) => `[${message.timestamp || 'now'}] ${message.role}: ${message.text}`)
        .join('\n\n')
    : '';
  const displayedReasoning =
    formatReasoningEvents(
      activeSession?.reasoningEvents || [],
      activeSession?.showStepIO === true,
    ) || sessionReasoning;
  const reasoningText = [
    isModelDownloading
      ? `Downloading ${selectedModelInfo.name || 'AI model'}${
          modelDownloadProgress ? ` — ${modelDownloadProgress}` : '…'
        }`
      : '',
    displayedReasoning,
  ]
    .filter(Boolean)
    .join('\n\n');

  return (
    [
      transcriptText ? `--- Transcript ---\n${transcriptText}` : null,
      reasoningText ? `--- Reasoning ---\n${reasoningText}` : null,
    ]
      .filter(Boolean)
      .join('\n\n') || 'Start a conversation with the AI Manager.'
  );
}
