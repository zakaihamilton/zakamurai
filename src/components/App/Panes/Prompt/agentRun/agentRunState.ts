import type { WebLLMGenerationMetrics, WebLLMRecoveryEvent } from '@/components/AI/types';
import type {
  AgentReasoningEntry,
  AgentRunUsage,
  AgentSession,
  LogStateShape,
} from '@/components/state/domain-types';
import type { StateStore } from '@/components/state/types';
import { MAX_REASONING_EVENTS, clipReasoningStepIO, createAgentRunUsage } from '../AgentSessions';

type PatchSession = (sessionId: string, patch: Partial<AgentSession>) => void;

export function createAgentRunState({
  sessionId,
  patchSession,
  logState,
}: {
  sessionId: string;
  patchSession: PatchSession;
  logState: StateStore<LogStateShape>;
}) {
  const runMetrics: WebLLMGenerationMetrics[] = [];
  const runRecoveries: WebLLMRecoveryEvent[] = [];
  const events: AgentReasoningEntry[] = [];
  let progressEventIndex: number | null = null;
  let runUsage: AgentRunUsage = createAgentRunUsage();

  const publishRunUsage = () => patchSession(sessionId, { runUsage });

  const recordMetrics = (metrics: WebLLMGenerationMetrics) => {
    runMetrics.push(metrics);
    const modelIds = new Set(runUsage.modelIds);
    if (metrics.modelId) modelIds.add(metrics.modelId);
    runUsage = {
      ...runUsage,
      modelIds: [...modelIds],
      modelCalls: runUsage.modelCalls + 1,
      outcomes: {
        ...runUsage.outcomes,
        [metrics.outcome]: runUsage.outcomes[metrics.outcome] + 1,
      },
      promptTokens: runUsage.promptTokens + (metrics.promptTokens ?? 0),
      promptTokenCalls: runUsage.promptTokenCalls + (metrics.promptTokens === undefined ? 0 : 1),
      completionTokens: runUsage.completionTokens + (metrics.completionTokens ?? 0),
      completionTokenCalls:
        runUsage.completionTokenCalls + (metrics.completionTokens === undefined ? 0 : 1),
      totalMs: runUsage.totalMs + metrics.totalMs,
      timeToFirstTokenMs: runUsage.timeToFirstTokenMs + (metrics.timeToFirstTokenMs ?? 0),
      timeToFirstTokenCalls:
        runUsage.timeToFirstTokenCalls + (metrics.timeToFirstTokenMs === undefined ? 0 : 1),
      decodeTokensPerSecond: runUsage.decodeTokensPerSecond + (metrics.decodeTokensPerSecond ?? 0),
      decodeTokensPerSecondCalls:
        runUsage.decodeTokensPerSecondCalls + (metrics.decodeTokensPerSecond === undefined ? 0 : 1),
    };
    publishRunUsage();
  };

  const recordRecovery = (event: WebLLMRecoveryEvent) => {
    runRecoveries.push(event);
  };

  const recordTool = (tool: string) => {
    runUsage = {
      ...runUsage,
      toolCalls: { ...runUsage.toolCalls, [tool]: (runUsage.toolCalls[tool] || 0) + 1 },
    };
    publishRunUsage();
  };

  const appendReasoning = (
    line: string,
    replaceProgress = false,
    metadata: Pick<AgentReasoningEntry, 'turn' | 'input' | 'output'> = {},
  ) => {
    const entry: AgentReasoningEntry = {
      text: line,
      timestamp: new Date().toTimeString().split(' ')[0],
      ...metadata,
      ...(metadata.input ? { input: clipReasoningStepIO(metadata.input) } : {}),
      ...(metadata.output ? { output: clipReasoningStepIO(metadata.output) } : {}),
    };
    if (replaceProgress && progressEventIndex !== null) events[progressEventIndex] = entry;
    else {
      events.push(entry);
      progressEventIndex = replaceProgress ? events.length - 1 : null;
    }
    const visible = events.slice(-MAX_REASONING_EVENTS);
    const reasoning = visible
      .map((item) => item.text)
      .filter(Boolean)
      .join('\n\n');
    patchSession(sessionId, { reasoning, reasoningEvents: visible });
    logState((draft) => {
      draft.reasoning = reasoning;
    });
  };

  return {
    runMetrics,
    runRecoveries,
    recordMetrics,
    recordRecovery,
    recordTool,
    appendReasoning,
  };
}
