import type { ManagerModelCall, ManagerModelClient } from '../types';

export async function loadManagerModel(): Promise<ManagerModelClient> {
  const { askWebLLM } = await import('../WebLLMAPI');
  return async ({
    model,
    messages,
    signal,
    onMetrics,
    onRecovery,
    temperature,
    top_p,
    max_tokens,
    contextWindowSize,
    sessionId,
    seed,
    responseFormat,
    taskKind,
    attempt,
  }: ManagerModelCall) =>
    askWebLLM('', '', null, {
      model,
      messages,
      signal,
      requestKind: 'agent',
      onMetrics,
      onRecovery,
      temperature,
      top_p,
      max_tokens,
      contextWindowSize,
      sessionId,
      seed,
      responseFormat,
      taskKind,
      attempt,
    });
}
