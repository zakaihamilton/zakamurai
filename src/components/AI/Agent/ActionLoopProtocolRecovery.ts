import { workspaceFulfillsInteractiveRequest } from '../ChangeValidator';
import { AgentExecutionError } from './ActionLoopErrors';
import {
  isIncompleteWriteError,
  recordTruncatedModelOutput,
  recoveryWritePath,
  wireNewComponentIntoScratchEntry,
} from './ActionLoopRecovery';
import { handleActionLoopDirectReply } from './ActionLoopSession';
import { isNewAppGenerationRequest } from './ActionLoopSmallModel';
import {
  type ActionLoopAction,
  type ActionLoopState,
  type ActionLoopStepOutcome,
  applyCssModuleRecovery,
  autoFinishSummary,
  clearFailedWriteAttempts,
  recordFailedWriteAttempt,
} from './ActionLoopState';
import { isFailedValidationResult, observation } from './ActionLoopUtils';

export const handleLengthLimitResponse = (state: ActionLoopState, turn: number): 'continue' => {
  if (state.modularGeneration) {
    state.modularOutputFailures += 1;
    const message =
      'The previous modular bundle reached the output token limit and was not staged. Return all required files again with very concise source and CSS Module contents, keeping the full bundle under about 1500 tokens. Do not omit the app entry, any required subcomponent, or any co-located CSS Module.';
    if (state.modularOutputFailures >= 2) {
      throw new AgentExecutionError(message, state.workspace.changes());
    }
    state.messages.push({ role: 'user', content: observation('model_output', false, message) });
    state.context.record('truncated_modular_output', message);
    state.onEvent({ type: 'observation', turn, error: true, message, agentRole: state.agentRole });
    return 'continue';
  }
  const target: string =
    state.forcedRecoveryTargetPath ||
    recoveryWritePath(state.workspace.files, state.activeFile) ||
    'src/App.jsx';
  state.incompleteWriteRetries += 1;
  state.forcedWriteRecoveryPending = true;
  state.forcedRecoveryTargetPath = target;
  state.failedWritePath = target;
  recordTruncatedModelOutput({
    turn,
    target,
    agentRole: state.agentRole,
    messages: state.messages,
    context: state.context,
    onEvent: state.onEvent,
  });
  if (state.incompleteWriteRetries >= state.incompleteWriteRetryLimit) {
    throw new AgentExecutionError(
      `The local model repeatedly reached the output token limit while generating ${target}. Staged changes were preserved for review; retry with a stronger model or a narrower request.`,
      state.workspace.changes(),
    );
  }
  return 'continue';
};

export const handleProtocolParseFailure = async (
  state: ActionLoopState,
  turn: number,
  reply: string,
  err: Error,
): Promise<Exclude<ActionLoopStepOutcome, { kind: 'proceed' }>> => {
  const replyText = typeof reply === 'string' ? reply : '';
  const directOutcome = await handleActionLoopDirectReply({
    replyText,
    workspace: state.workspace,
    taskContract: state.taskContract,
    validate: state.validate,
    runValidation: state.runValidation,
    turn,
    directChangesRecoveryPending: state.directChangesRecoveryPending,
    forcedWriteRecoveryPending: state.forcedWriteRecoveryPending,
    directRepairAttempts: state.directRepairAttempts,
    activeFile: state.activeFile,
    previewInspectionRequired: state.previewInspectionRequired,
    previewInspectState: state.previewInspectState,
    inspectPreview: state.inspectPreview,
    onEvent: state.onEvent,
    agentRole: state.agentRole,
    hostAssistedSession: state.hostAssistedSession,
    modularGeneration: state.modularGeneration,
    modularOutputFailures: state.modularOutputFailures,
    request: state.request,
    modularTargetPath: state.lightweightTargetPath,
    applyCssModuleRecovery: (recoveryTurn) => applyCssModuleRecovery(state, recoveryTurn),
    autoFinishSummary: (reason, wiredEntry) => autoFinishSummary(state, reason, wiredEntry),
    context: state.context,
    clearFailedWriteAttempts: () => clearFailedWriteAttempts(state),
    messages: state.messages,
  });
  if (directOutcome.kind === 'handled') {
    state.modularOutputFailures =
      directOutcome.modularOutputFailures ?? state.modularOutputFailures;
    state.directRepairAttempts = directOutcome.directRepairAttempts ?? state.directRepairAttempts;
    if (directOutcome.result) return { kind: 'return', result: directOutcome.result };
    return { kind: 'continue' };
  }
  if (directOutcome.kind === 'repair') {
    state.directRepairAttempts = directOutcome.directRepairAttempts;
    state.failedWritePath = directOutcome.failedWritePath;
    state.failedWriteContent = directOutcome.failedWriteContent;
    state.failedWriteDiagnostic = directOutcome.failedWriteDiagnostic;
    state.forcedWriteRecoveryPending = Boolean(state.failedWritePath);
    state.forcedRecoveryTargetPath = state.failedWritePath || state.forcedRecoveryTargetPath;
    return { kind: 'continue' };
  }
  if (state.modularGeneration) {
    state.modularOutputFailures += 1;
    if (state.modularOutputFailures >= 2) {
      throw new AgentExecutionError(
        `The local model could not provide the required modular file bundle. ${state.modularOutputRecoveryMessage}`,
        state.workspace.changes(),
      );
    }
    state.messages.push({
      role: 'user',
      content: observation('protocol', false, state.modularOutputRecoveryMessage),
    });
    state.context.record('modular_generation_recovery', state.modularOutputRecoveryMessage);
    state.onEvent({
      type: 'observation',
      turn,
      error: true,
      message: state.modularOutputRecoveryMessage,
      agentRole: state.agentRole,
    });
    return { kind: 'continue' };
  }
  state.protocolFailures++;
  if (isIncompleteWriteError(err.message)) {
    state.incompleteWriteRetries += 1;
    const target: string =
      state.forcedRecoveryTargetPath ||
      recoveryWritePath(state.workspace.files, state.activeFile) ||
      'src/App.jsx';
    state.forcedWriteRecoveryPending = true;
    state.forcedRecoveryTargetPath = target;
    if (state.incompleteWriteRetries <= state.incompleteWriteRetryLimit) {
      // Give the first metadata-only reply a free retry; later incompletes count.
      if (state.incompleteWriteRetries > 1) {
        recordFailedWriteAttempt(state, target);
      }
      const recoveryMessage = state.lightweightModel
        ? `write_file metadata was returned without source content. Reply with ONLY a labelled code fence containing the complete source for ${target}. Do not return JSON.`
        : `write_file metadata was returned without source content. Reply again with write_file for ${target} and include the complete file body in the same response (a labelled code fence immediately after the JSON line).`;
      state.messages.push({
        role: 'user',
        content: observation('protocol', false, recoveryMessage),
      });
      state.context.record('incomplete_write_recovery', recoveryMessage);
      state.onEvent({
        type: 'observation',
        turn,
        action: { action: 'write_file', path: target },
        error: true,
        message: recoveryMessage,
        agentRole: state.agentRole,
      });
      return { kind: 'continue' };
    }
    recordFailedWriteAttempt(state, target);
  }
  if (state.forcedWriteRecoveryPending) {
    if (++state.forcedWriteRecoveryViolations >= state.forcedRecoveryViolationLimit) {
      if (!state.directChangesRecoveryPending) {
        state.directChangesRecoveryPending = true;
        const target =
          state.forcedRecoveryTargetPath ||
          recoveryWritePath(state.workspace.files, state.activeFile);
        const recoveryMessage = state.lightweightModel
          ? target
            ? `Fence-only recovery is active. Reply with ONLY a labelled code fence containing complete source for ${target}. Do not return JSON.`
            : 'Fence-only recovery is active. Reply with ONLY a labelled code fence containing complete source. Do not return JSON.'
          : target
            ? `Direct recovery is active. Return one kind=changes response containing complete content for ${target}. Do not return another action.`
            : 'Direct recovery is active. Return one kind=changes response containing complete file contents. Do not return another action.';
        state.messages.push({
          role: 'user',
          content: observation('direct_recovery', false, recoveryMessage),
        });
        state.context.record('direct_recovery', recoveryMessage);
        state.onEvent({
          type: 'observation',
          turn,
          action: { action: 'write_file', path: target || undefined },
          error: true,
          message: `${err.message}. ${recoveryMessage}`,
          agentRole: state.agentRole,
        });
        return { kind: 'continue' };
      }
      throw new AgentExecutionError(
        'The local model could not provide a write_file action after forced recovery. Staged changes were preserved for review; retry with a stronger model or a narrower request.',
        state.workspace.changes(),
      );
    }
    const target =
      state.forcedRecoveryTargetPath || recoveryWritePath(state.workspace.files, state.activeFile);
    const recoveryMessage = state.lightweightModel
      ? `Recovery mode is active. Reply with ONLY a labelled code fence containing complete source${target ? ` for ${target}` : ''}. Do not return JSON, list_files, validate, or prose.`
      : `Recovery mode is active. Return exactly one write_file action${target ? ` for ${target}` : ''} with complete source content. Do not use list_files, validate, inspect_preview, or prose.`;
    state.messages.push({
      role: 'user',
      content: observation('protocol', false, `${err.message}. ${recoveryMessage}`),
    });
    state.context.record('stuck_read_recovery', recoveryMessage);
    state.onEvent({
      type: 'observation',
      turn,
      action: { action: 'write_file', path: target || undefined },
      error: true,
      message: `${err.message}. ${recoveryMessage}`,
      agentRole: state.agentRole,
    });
    return { kind: 'continue' };
  }
  if (state.finishAfterAutomaticValidation && state.workspace.changes().length > 0) {
    applyCssModuleRecovery(state, turn);
    const wiredEntry = wireNewComponentIntoScratchEntry(state.workspace);
    const changes = state.workspace.changes();
    const summary = autoFinishSummary(state, 'identical-write', wiredEntry);
    state.onEvent({
      type: 'finished',
      turn,
      changes,
      message: summary,
      agentRole: state.agentRole,
    });
    state.context.record('validation', state.automaticValidationResult || 'passed');
    return {
      kind: 'return',
      result: {
        changes,
        files: state.workspace.files,
        summary,
        events: turn,
        workspace: state.workspace,
      },
    };
  }
  if (
    state.hostAssistedSession &&
    state.workspace.changes().length > 0 &&
    (state.validate || isNewAppGenerationRequest(state.request))
  ) {
    try {
      applyCssModuleRecovery(state, turn);
      const fulfillmentError = isNewAppGenerationRequest(state.request)
        ? workspaceFulfillsInteractiveRequest(state.workspace.files, state.request)
        : null;
      if (fulfillmentError) throw new Error(fulfillmentError);
      const validationResult = state.validate
        ? await state.runValidation(turn)
        : 'Deterministic request-fulfillment checks passed.';
      if (!state.validate || !isFailedValidationResult(validationResult)) {
        const wiredEntry = wireNewComponentIntoScratchEntry(state.workspace);
        const changes = state.workspace.changes();
        const summary = autoFinishSummary(
          state,
          state.validate ? 'validate' : 'fulfillment',
          wiredEntry,
        );
        state.onEvent({
          type: 'finished',
          turn,
          changes,
          message: summary,
          agentRole: state.agentRole,
        });
        state.context.record(state.validate ? 'validation' : 'fulfillment', validationResult);
        return {
          kind: 'return',
          result: {
            changes,
            files: state.workspace.files,
            summary,
            events: turn,
            workspace: state.workspace,
          },
        };
      }
    } catch {}
  }
  if (state.protocolFailures >= 4)
    throw new Error(
      `Local model could not follow the agent protocol after recovery: ${err.message}`,
    );
  const incompleteWriteGuidance = state.lightweightModel
    ? `${err.message}. Reply with ONLY a labelled code fence containing complete source code for ${
        state.forcedRecoveryTargetPath ||
        recoveryWritePath(state.workspace.files, state.activeFile) ||
        'the target file'
      }. Do not return JSON or prose.`
    : isIncompleteWriteError(err.message)
      ? `${err.message}. Return write_file again with the complete file content in the same response.`
      : `${err.message}. Do not write prose. Reply with exactly one JSON action that advances the request (prefer write_file with complete content for an edit request).`;
  state.messages.push({
    role: 'user',
    content: observation('protocol', false, incompleteWriteGuidance),
  });
  return { kind: 'continue' };
};

export const handleModularGenerationFallback = (
  state: ActionLoopState,
  turn: number,
  action: ActionLoopAction,
): void => {
  state.modularGeneration = false;
  state.hostAssistedWrite = true;
  const isSingleAppWrite =
    action.action === 'write_file' && action.path === state.lightweightTargetPath;
  const message = isSingleAppWrite
    ? 'The local model returned a single app file instead of the requested modular bundle. The host will use CSS Module recovery for this response.'
    : 'The local model chose the host-assisted action flow instead of a complete modular bundle. Continue with the supplied actions; the host will recover CSS Modules and validate the app.';
  state.context.record('modular_generation_legacy_fallback', message);
  state.onEvent({ type: 'observation', turn, action, message, agentRole: state.agentRole });
};
