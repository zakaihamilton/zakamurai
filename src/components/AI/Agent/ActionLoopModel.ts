import { getModelCapabilityProfile } from '@/components/AI/ReliabilityContracts';
import type {
  AgentModelSession,
  ManagerModelClient,
  RunAgentOptions,
  WebLLMMessage,
  WebLLMRecoveryEvent,
} from '@/components/AI/types';
import { getModelDownloadProgress } from './ActionLoopRecovery';

type AskWebLLM = Awaited<ReturnType<typeof import('./ActionLoopRecovery').loadAskWebLLM>>;

type ActionModelResponse = {
  text: string;
  finishReason?: string | null;
};

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
  seed,
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
  seed?: number;
}): Promise<ActionModelResponse> {
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

  const profile = getModelCapabilityProfile(model);
  const maxTokens =
    visualMode || failedWritePath || forcedWriteRecoveryPending
      ? profile.recoveryTokens
      : profile.generationTokens;
  const temperature = lightweightModel ? 0.05 : visualMode ? 0.12 : 0.15;
  const topP = lightweightModel ? 0.85 : 0.8;
  const taskKind = failedWritePath || forcedWriteRecoveryPending ? 'repair-file' : 'write-file';
  const attemptSeed = seed === undefined ? undefined : seed + turn - 1;
  let finishReason: string | null | undefined;
  const handleMetrics: RunAgentOptions['onMetrics'] = (metrics) => {
    if (
      metrics.requestKind === 'agent' &&
      (metrics.attempt === undefined || metrics.attempt === turn)
    ) {
      finishReason = metrics.finishReason;
    }
    onMetrics?.(metrics);
  };

  try {
    if (modelSession) {
      const text = await modelSession.generate({
        model,
        messages: safeModelMessages,
        signal,
        task: 'generate-changes',
        onMetrics: handleMetrics,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        contextWindowSize: profile.contextWindowSize,
        sessionId,
        seed: attemptSeed,
        taskKind,
        attempt: turn,
      });
      return { text, finishReason };
    }
    if (modelClient) {
      const text = await modelClient({
        model,
        messages,
        signal,
        task: 'generate-changes',
        onMetrics: handleMetrics,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        contextWindowSize: profile.contextWindowSize,
        sessionId,
        seed: attemptSeed,
        taskKind,
        attempt: turn,
      });
      return { text, finishReason };
    }
    if (!askWebLLM) throw new Error('WebLLM is unavailable.');
    const text = await askWebLLM(
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
        onMetrics: handleMetrics,
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
        contextWindowSize: profile.contextWindowSize,
        sessionId,
        seed: attemptSeed,
        taskKind,
        attempt: turn,
      },
    );
    return { text, finishReason };
  } finally {
    clearInterval(heartbeat);
  }
}
