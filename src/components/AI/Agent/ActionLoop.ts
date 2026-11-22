import type { RunAgentOptions, RunAgentResult } from '@/components/AI/types';
import { executeActionStep } from './ActionLoopActionExecutor';
import { finalizeAtSafetyLimit } from './ActionLoopFinishGate';
import { runActionLoopGuards } from './ActionLoopLoopGuards';
import { requestNextAction } from './ActionLoopModel';
import {
  handleLengthLimitResponse,
  handleModularGenerationFallback,
  handleProtocolParseFailure,
} from './ActionLoopProtocolRecovery';
import { buildActionLoopModelMessages, recoveryWritePath } from './ActionLoopRecovery';
import { type ActionLoopAction, createActionLoopState } from './ActionLoopState';
import { parseAgentAction } from './Protocol';

export async function runActionLoop(options: RunAgentOptions): Promise<RunAgentResult> {
  const state = await createActionLoopState(options);

  for (let turn = 1; turn <= state.maxTurns; turn++) {
    if (state.signal?.aborted) throw new DOMException('Agent stopped', 'AbortError');
    state.onEvent({
      type: 'thinking',
      turn,
      agentRole: state.agentRole,
      message:
        turn === 1
          ? 'Reviewing the request and available workspace context before choosing an action…'
          : 'Requesting the next action from the local model...',
    });

    const recoveryTarget =
      state.forcedRecoveryTargetPath || recoveryWritePath(state.workspace.files, state.activeFile);
    const modelMessages = buildActionLoopModelMessages({
      request: state.request,
      targetPath: recoveryTarget,
      files: state.workspace.files,
      failedWritePath: state.failedWritePath,
      failedWriteContent: state.failedWriteContent,
      failedWriteDiagnostic: state.failedWriteDiagnostic,
      directChangesRecoveryPending: state.directChangesRecoveryPending,
      forcedWriteRecoveryPending: state.forcedWriteRecoveryPending,
      incompleteWriteRetries: state.incompleteWriteRetries,
      lightweight: state.lightweightModel,
      messages: state.messages,
      preserveSessionPrefix: Boolean(state.sessionId || state.modelSession),
    });
    const safeModelMessages = modelMessages.filter(Boolean);
    const modelResponse = await requestNextAction({
      askWebLLM: state.askWebLLM,
      modelSession: state.modelSession,
      modelClient: state.modelClient,
      model: state.model,
      messages: modelMessages,
      safeModelMessages,
      signal: state.signal,
      onMetrics: state.onMetrics,
      sessionId: state.sessionId,
      lightweightModel: state.lightweightModel,
      visualMode: state.visualMode,
      failedWritePath: state.failedWritePath,
      forcedWriteRecoveryPending: state.forcedWriteRecoveryPending,
      turn,
      agentRole: state.agentRole,
      onEvent: state.onEvent,
      seed: state.seed,
    });
    const reply = modelResponse.text;
    state.onEvent({
      type: 'model_io',
      turn,
      agentRole: state.agentRole,
      input: safeModelMessages
        .map((message) => `[${message.role}]\n${message.content}`)
        .join('\n\n'),
      output: reply,
    });

    if (modelResponse.finishReason === 'length') {
      handleLengthLimitResponse(state, turn);
      continue;
    }

    state.messages.push({ role: 'assistant', content: reply });
    let action: ActionLoopAction | undefined;
    try {
      action = parseAgentAction(reply, {
        allowedActions: state.effectiveAllowedActions,
        // Bind common source-only replies to the known entry path.
        defaultWritePath: state.forcedRecoveryTargetPath || state.lightweightTargetPath,
      });
      state.protocolFailures = 0;
    } catch (error) {
      const outcome = await handleProtocolParseFailure(state, turn, reply, error as Error);
      if (outcome.kind === 'return') return outcome.result;
      continue;
    }

    if (state.modularGeneration) {
      handleModularGenerationFallback(state, turn, action);
    }

    const fingerprint = JSON.stringify(action);
    const guardOutcome = await runActionLoopGuards(state, turn, action, fingerprint);
    if (guardOutcome.kind === 'return') return guardOutcome.result;
    if (guardOutcome.kind === 'continue') continue;

    const stepOutcome = await executeActionStep(state, turn, action, fingerprint);
    if (stepOutcome.kind === 'return') return stepOutcome.result;
  }

  return finalizeAtSafetyLimit(state, state.maxTurns);
}
