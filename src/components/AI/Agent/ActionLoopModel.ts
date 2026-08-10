import type {
  AgentModelSession,
  ManagerModelClient,
  RunAgentOptions,
  WebLLMMessage,
  WebLLMRecoveryEvent,
} from '@/components/AI/types';
import {
  AGENT_CONTEXT_WINDOW_SIZE,
  AGENT_GENERATION_TOKENS,
  AGENT_RECOVERY_TOKENS,
  LIGHTWEIGHT_AGENT_GENERATION_TOKENS,
  LIGHTWEIGHT_AGENT_RECOVERY_TOKENS,
  getModelDownloadProgress,
} from './ActionLoopRecovery';

type AskWebLLM = Awaited<ReturnType<typeof import('./ActionLoopRecovery').loadAskWebLLM>>;

export async function requestNextAction({
  askWebLLM,
  modelSession,
  modelClient,
  model,
  messages,
  safeModelMessages,
  signal,
  onMetrics,
  sessionId,
  lightweightModel,
  visualMode,
  failedWritePath,
  forcedWriteRecoveryPending,
  turn,
  agentRole,
  onEvent,
}: {
  askWebLLM: AskWebLLM | null;
  modelSession?: AgentModelSession;
  modelClient?: ManagerModelClient;
  model: string;
  messages: WebLLMMessage[];
  safeModelMessages: WebLLMMessage[];
  signal?: AbortSignal;
  onMetrics?: RunAgentOptions['onMetrics'];
  sessionId?: string;
  lightweightModel: boolean;
  visualMode: boolean;
  failedWritePath: string;
  forcedWriteRecoveryPending: boolean;
  turn: number;
  agentRole: string | null;
  onEvent: NonNullable<RunAgentOptions['onEvent']>;
}): Promise<string> {
  let receivedModelOutput = false;
  let streamedCharacterCount = 0;
  let lastEmitTime = 0;
  let lastEmitCharCount = 0;
  const responseStartedAt = Date.now();
  const heartbeat = setInterval(() => {
    const elapsedSeconds = Math.max(1, Math.floor((Date.now() - responseStartedAt) / 1000));
    const downloadProgress = getModelDownloadProgress(model);
    const progress = downloadProgress
      ? downloadProgress
      : receivedModelOutput
        ? `${streamedCharacterCount.toLocaleString()} character(s) received; waiting for a complete action before validation`
        : 'the model has not started streaming yet; keeping the workspace context ready';
    onEvent({
      type: 'thinking',
      turn,
      agentRole,
      replaceProgress: true,
      message: `Local model is still working (${elapsedSeconds}s elapsed; ${progress})…`,
    });
  }, 3_000);

  const recoveryTokens = lightweightModel
    ? LIGHTWEIGHT_AGENT_RECOVERY_TOKENS
    : AGENT_RECOVERY_TOKENS;
  const generationTokens = lightweightModel
    ? LIGHTWEIGHT_AGENT_GENERATION_TOKENS
    : AGENT_GENERATION_TOKENS;
  const maxTokens = lightweightModel
    ? visualMode || failedWritePath || forcedWriteRecoveryPending
      ? recoveryTokens
      : generationTokens
    : visualMode || failedWritePath || forcedWriteRecoveryPending
      ? recoveryTokens
      : generationTokens;
  const temperature = lightweightModel ? 0.05 : visualMode ? 0.12 : 0.15;
  const topP = lightweightModel ? 0.85 : 0.8;

  try {
    if (modelSession) {
      return await modelSession.generate({
        model,
        messages: safeModelMessages,
        signal,
        task: 'generate-changes',
        onMetrics,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        contextWindowSize: AGENT_CONTEXT_WINDOW_SIZE,
        sessionId,
      });
    }
    if (modelClient) {
      return await modelClient({
        model,
        messages,
        signal,
        task: 'generate-changes',
        onMetrics,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        contextWindowSize: AGENT_CONTEXT_WINDOW_SIZE,
        sessionId,
      });
    }
    if (!askWebLLM) throw new Error('WebLLM is unavailable.');
    return await askWebLLM(
      '',
      '',
      (output) => {
        streamedCharacterCount = output.length;
        const now = Date.now();
        const isFirstChunk = !receivedModelOutput;
        receivedModelOutput = true;

        const charDelta = streamedCharacterCount - lastEmitCharCount;
        const timeDelta = now - lastEmitTime;

        if (
          isFirstChunk ||
          timeDelta >= 500 ||
          charDelta >= 100 ||
          (charDelta >= 15 && timeDelta === 0)
        ) {
          lastEmitTime = now;
          lastEmitCharCount = streamedCharacterCount;
          const waitingTarget = lightweightModel ? 'complete source code' : 'one complete action';
          onEvent({
            type: 'thinking',
            turn,
            agentRole,
            replaceProgress: true,
            message: `Local model is responding — streaming its next action (${streamedCharacterCount.toLocaleString()} character(s) received). Waiting for ${waitingTarget} before validation…`,
          });
        }
      },
      {
        model,
        messages: safeModelMessages,
        signal,
        requestKind: 'agent',
        onMetrics,
        onRecovery: (recovery: WebLLMRecoveryEvent) => {
          const action =
            recovery.action === 'fallback' || recovery.action === 'reuse-fallback'
              ? `continuing with cached fallback ${recovery.modelId}`
              : `rebuilding ${recovery.modelId} and retrying`;
          onEvent({
            type: 'thinking',
            turn,
            agentRole,
            replaceProgress: true,
            message: `Local model recovery: ${action} after ${recovery.reason.replaceAll('-', ' ')}.`,
          });
        },
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        contextWindowSize: AGENT_CONTEXT_WINDOW_SIZE,
        sessionId,
      },
    );
  } finally {
    clearInterval(heartbeat);
  }
}
