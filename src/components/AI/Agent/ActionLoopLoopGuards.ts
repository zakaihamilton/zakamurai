import { AgentExecutionError, AgentRecoveryValidationError } from './ActionLoopErrors';
import {
  CHANGE_REQUEST_PATTERN,
  recoveryWritePath,
  wireNewComponentIntoScratchEntry,
} from './ActionLoopRecovery';
import {
  type ActionLoopAction,
  type ActionLoopState,
  type ActionLoopStepOutcome,
  applyCssModuleRecovery,
  autoFinishSummary,
  stageDeferredRecovery,
  stageRecoveredWrite,
} from './ActionLoopState';
import {
  NON_PRODUCTIVE_ACTIONS,
  READ_ONLY_ACTIONS,
  cssModuleRecovery,
  formatReasoningResult,
  formatValidationSummary,
  isFailedValidationResult,
  observation,
} from './ActionLoopUtils';

const handleForcedWriteViolation = async (
  state: ActionLoopState,
  turn: number,
  action: ActionLoopAction,
): Promise<ActionLoopStepOutcome> => {
  if (!state.forcedWriteRecoveryPending || action.action === 'write_file') {
    return { kind: 'proceed' };
  }
  state.forcedWriteRecoveryViolations += 1;
  if (state.forcedWriteRecoveryViolations === 1 && state.workspace.changes().length === 0) {
    state.directChangesRecoveryPending = true;
    const target =
      state.forcedRecoveryTargetPath || recoveryWritePath(state.workspace.files, state.activeFile);
    const recoveryMessage = state.lightweightModel
      ? `Fence-only recovery is active. Reply with ONLY a labelled code fence containing complete source${target ? ` for ${target}` : ''}. Do not return another action.`
      : `Direct recovery is active. Return one kind=changes response containing complete content${target ? ` for ${target}` : ''}. Do not return another action.`;
    state.messages.push({
      role: 'user',
      content: observation('direct_recovery', false, recoveryMessage),
    });
    state.context.record('direct_recovery', recoveryMessage);
    return { kind: 'continue' };
  }
  if (state.forcedWriteRecoveryViolations >= 2) {
    if (state.workspace.changes().length > 0) {
      const wiredEntry = wireNewComponentIntoScratchEntry(state.workspace);
      const result = await state.runValidation(turn);
      if (isFailedValidationResult(result)) {
        throw new AgentRecoveryValidationError(
          `Validation failed after forced write recovery: ${result}`,
          state.workspace.changes(),
        );
      }
      const summary = wiredEntry
        ? `Validated staged changes after forced write recovery limit reached and wired ${wiredEntry}.`
        : 'Validated staged changes after forced write recovery limit reached.';
      state.onEvent({
        type: 'finished',
        turn,
        changes: state.workspace.changes(),
        message: summary,
        agentRole: state.agentRole,
      });
      state.context.record('validation', result);
      return {
        kind: 'return',
        result: {
          changes: state.workspace.changes(),
          files: state.workspace.files,
          summary,
          events: turn,
          workspace: state.workspace,
        },
      };
    }
    if (!state.directChangesRecoveryPending) {
      state.directChangesRecoveryPending = true;
      const target =
        state.forcedRecoveryTargetPath ||
        recoveryWritePath(state.workspace.files, state.activeFile);
      const recoveryMessage = state.lightweightModel
        ? target
          ? `Fence-only recovery is active. Reply with ONLY a labelled code fence containing complete source for ${target}. Do not return another action.`
          : 'Fence-only recovery is active. Reply with ONLY a labelled code fence containing complete source. Do not return another action.'
        : target
          ? `Direct recovery is active. Return one kind=changes response containing complete content for ${target}. Do not return another action.`
          : 'Direct recovery is active. Return one kind=changes response containing complete file contents. Do not return another action.';
      state.messages.push({
        role: 'user',
        content: observation('direct_recovery', false, recoveryMessage),
      });
      state.context.record('direct_recovery', recoveryMessage);
      return { kind: 'continue' };
    }
    throw new AgentExecutionError(
      'The local model repeatedly read unchanged files without editing, including after a forced write recovery. It was stopped early to avoid exhausting the step limit; retry with a stronger model or a narrower request.',
      state.workspace.changes(),
    );
  }
  const target =
    state.forcedRecoveryTargetPath || recoveryWritePath(state.workspace.files, state.activeFile);
  const message = state.lightweightModel
    ? target
      ? `Recovery mode is active. Do not inspect files again. Reply with ONLY a labelled code fence containing complete source for ${target}.`
      : 'Recovery mode is active. Do not inspect files again. Reply with ONLY a labelled code fence containing complete source.'
    : target
      ? `Recovery mode is active. Do not inspect files again. Your next response must be a write_file action for ${target} with complete source content that fulfills the original request.`
      : 'Recovery mode is active. Do not inspect files again. Your next response must be a write_file action that fulfills the original request.';
  state.messages.push({ role: 'user', content: observation(action.action, false, message) });
  state.context.record('stuck_read_recovery', message);
  state.onEvent({
    type: 'observation',
    turn,
    action,
    error: true,
    message,
    agentRole: state.agentRole,
  });
  return { kind: 'continue' };
};

const flushDeferredSourceWrite = (
  state: ActionLoopState,
  turn: number,
  action: ActionLoopAction,
): ActionLoopStepOutcome => {
  if (
    !state.deferredSourceWrite ||
    (action.action === 'write_file' &&
      state.deferredSourceWrite.stylesheets.includes(action.path || ''))
  ) {
    return { kind: 'proceed' };
  }
  const source = state.deferredSourceWrite;
  for (const stylesheet of source.stylesheets) {
    stageRecoveredWrite(
      state,
      turn,
      stylesheet,
      cssModuleRecovery(source.content, state.resolvedStyleProfile, stylesheet),
    );
  }
  stageRecoveredWrite(state, turn, source.path, source.content);
  state.validationState.wroteSinceVerification = true;
  state.deferredSourceWrite = null;
  const recoveryMessage = stageDeferredRecovery(state, source, turn, action);
  if (recoveryMessage) {
    state.messages.push({
      role: 'user',
      content: observation('css_recovery', false, recoveryMessage),
    });
    return { kind: 'continue' };
  }
  state.forcedWriteRecoveryPending = false;
  state.forcedRecoveryTargetPath = null;
  const message = `The model did not provide the requested CSS Module, so staged ${source.path} with generated semantic CSS recovery for ${source.stylesheets.join(', ')}.`;
  state.messages.push({ role: 'user', content: observation('css_recovery', true, message) });
  state.context.record('css_recovery', message);
  state.onEvent({ type: 'observation', turn, action, message, agentRole: state.agentRole });
  // Lightweight finish can proceed on the recovered workspace.
  return state.hostAssistedSession && action.action === 'finish'
    ? { kind: 'proceed' }
    : { kind: 'continue' };
};

const checkStuckReadAndNonProductive = async (
  state: ActionLoopState,
  turn: number,
  action: ActionLoopAction,
): Promise<ActionLoopStepOutcome> => {
  if (
    CHANGE_REQUEST_PATTERN.test(state.request) &&
    NON_PRODUCTIVE_ACTIONS.has(action.action) &&
    state.workspace.changes().length === 0
  ) {
    state.nonProductiveActionsWithoutWrite++;
    if (
      state.nonProductiveActionsWithoutWrite >= state.nonProductiveActionLimit &&
      !state.forcedWriteRecoveryPending
    ) {
      const target =
        state.forcedRecoveryTargetPath ||
        recoveryWritePath(state.workspace.files, state.activeFile);
      state.forcedWriteRecoveryPending = true;
      const message = `Recovery mode: the workspace has already been inspected. Do not list, search, or read files again. Your next response must be a write_file action${target ? ` for ${target}` : ''} that fulfills the original request, with complete source content. Only call finish if no code change is needed.`;
      state.messages.push({
        content: observation('stuck_read_recovery', false, message),
        role: 'user',
      });
      state.context.record('stuck_read_recovery', message);
      state.onEvent({
        type: 'observation',
        turn,
        action,
        error: true,
        message,
        agentRole: state.agentRole,
      });
      return { kind: 'continue' };
    }
  }
  if (action.action === 'read_file') {
    const path = action.path || '';
    const content = state.workspace.files[path];
    if (state.lastReadContents.has(path) && state.lastReadContents.get(path) === content) {
      const message = `Duplicate read_file skipped — ${path} has not changed since it was last read. Reuse the existing result and take a productive action.`;
      state.messages.push({ role: 'user', content: observation(action.action, true, message) });
      state.context.record('read_file', message);
      state.onEvent({ type: 'observation', turn, action, message, agentRole: state.agentRole });
      state.unchangedReadSkips++;
      // Prompt small models for a productive write while context is fresh.
      if (state.unchangedReadSkips === 1 && state.workspace.changes().length === 0) {
        const target =
          state.forcedRecoveryTargetPath ||
          recoveryWritePath(state.workspace.files, state.activeFile);
        state.forcedWriteRecoveryPending = true;
        const recoveryMsg = `Recovery mode: the workspace has already been inspected. Do not list, search, or read files again. Your next response must be a write_file action${target ? ` for ${target}` : ''} that fulfills the original request, with complete source content. Only call finish if no code change is needed.`;
        state.messages.push({
          role: 'user',
          content: observation('stuck_read_recovery', false, recoveryMsg),
        });
        return { kind: 'continue' };
      }
      if (state.unchangedReadSkips >= 2 && state.workspace.changes().length === 0) {
        throw new AgentExecutionError(
          'The local model repeatedly read unchanged files without editing, including after a forced write recovery. It was stopped early to avoid exhausting the step limit; retry with a stronger model or a narrower request.',
          [],
        );
      }
      if (state.unchangedReadSkips >= 2 && state.workspace.changes().length > 0) {
        applyCssModuleRecovery(state, turn);
        const wiredEntry = wireNewComponentIntoScratchEntry(state.workspace);
        const result = await state.runValidation(turn);
        if (isFailedValidationResult(result)) {
          throw new AgentRecoveryValidationError(
            `Validation failed after repeated unchanged reads: ${result}`,
            state.workspace.changes(),
          );
        }
        const summary = autoFinishSummary(state, 'unchanged-reads', wiredEntry);
        state.onEvent({
          type: 'finished',
          turn,
          changes: state.workspace.changes(),
          message: summary,
          agentRole: state.agentRole,
        });
        state.context.record('validation', result);
        return {
          kind: 'return',
          result: {
            changes: state.workspace.changes(),
            files: state.workspace.files,
            summary,
            events: turn,
            workspace: state.workspace,
          },
        };
      }
      return { kind: 'continue' };
    }
  }
  return { kind: 'proceed' };
};

const handleRepeatedActionGuards = async (
  state: ActionLoopState,
  turn: number,
  action: ActionLoopAction,
  fingerprint: string,
): Promise<ActionLoopStepOutcome> => {
  if (fingerprint === state.recoveredNoOpWrite) {
    applyCssModuleRecovery(state, turn);
    const wiredEntry = wireNewComponentIntoScratchEntry(state.workspace);
    const summary = autoFinishSummary(state, 'identical-write', wiredEntry);
    const changes = state.workspace.changes();
    state.onEvent({
      type: 'finished',
      turn,
      changes,
      message: summary,
      agentRole: state.agentRole,
    });
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
  if (state.recoveredNoOpWrite) state.recoveredNoOpWrite = '';
  state.repeatedActions = fingerprint === state.lastFingerprint ? state.repeatedActions + 1 : 0;
  state.lastFingerprint = fingerprint;
  const writePath = action.action === 'write_file' ? action.path || '' : '';
  const isRepeatedSavedWrite =
    action.action === 'write_file' &&
    ((Object.hasOwn(state.workspace.files, writePath) &&
      state.workspace.files[writePath] === (action.content || '')) ||
      // Normalization can make a repeated raw write differ from the staged file.
      (fingerprint === state.lastSuccessfulFingerprint && state.workspace.changes().length > 0));
  // Finish on the second consecutive validate when staged work already exists.
  if (
    action.action === 'validate' &&
    state.workspace.changes().length > 0 &&
    (state.repeatedActions >= 1 || state.finishAfterAutomaticValidation)
  ) {
    if (
      state.finishAfterAutomaticValidation &&
      state.previewInspectionRequired &&
      (!state.previewInspectState.inspectedPreview ||
        !state.previewInspectState.previewInspectionAccepted)
    ) {
      const previewResult = await state.inspectPreviewForLoop(turn);
      if (!state.previewInspectState.previewInspectionAccepted) {
        state.finishAfterAutomaticValidation = false;
        state.messages.push({
          role: 'user',
          content: observation(
            'inspect_preview',
            false,
            `${previewResult}\nThe preview is not ready for completion. Fix the rendered app or inspect it again before finishing.`,
          ),
        });
        return { kind: 'continue' };
      }
    }
    const validationResult = state.finishAfterAutomaticValidation
      ? state.automaticValidationResult
      : await state.runValidation(turn);
    state.finishAfterAutomaticValidation = false;
    state.automaticValidationResult = '';
    applyCssModuleRecovery(state, turn);
    const result = validationResult;
    if (isFailedValidationResult(result)) {
      state.failedWritePath =
        state.forcedRecoveryTargetPath ||
        recoveryWritePath(state.workspace.files, state.activeFile) ||
        '';
      state.failedWriteContent = state.failedWritePath
        ? state.workspace.files[state.failedWritePath] || ''
        : '';
      state.failedWriteDiagnostic = result;
      state.forcedWriteRecoveryPending = Boolean(state.failedWritePath);
      state.forcedRecoveryTargetPath = state.failedWritePath || state.forcedRecoveryTargetPath;
      state.messages.push({ role: 'user', content: observation(action.action, false, result) });
      state.onEvent({
        type: 'observation',
        turn,
        action,
        error: true,
        message: result,
        agentRole: state.agentRole,
      });
      return { kind: 'continue' };
    }
    const wiredEntry = wireNewComponentIntoScratchEntry(state.workspace);
    const changes = state.workspace.changes();
    const summary = autoFinishSummary(state, 'validate', wiredEntry);
    state.onEvent({
      type: 'finished',
      turn,
      changes,
      message: summary,
      agentRole: state.agentRole,
    });
    state.context.record('validation', result);
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
  if (state.repeatedActions === 2 || (state.repeatedActions === 1 && isRepeatedSavedWrite)) {
    if (isRepeatedSavedWrite) {
      const message = `The proposed write to ${action.path} is already staged with identical content. Automatically validating the workspace instead of rewriting it.`;
      try {
        applyCssModuleRecovery(state, turn);
        const result = await state.runValidation(turn);
        const validationFailed = isFailedValidationResult(result);
        const summaryText = formatValidationSummary(result);
        const finishHint = validationFailed
          ? ' Validation failed for the staged changes. Do not finish. Return a corrected write_file action with complete working source.'
          : ' Validation passed for the staged changes. Your next action must be finish with a brief summary. Do not rewrite or validate again.';
        state.messages.push({
          role: 'user',
          content: observation(
            action.action,
            !validationFailed,
            `${message}\n${summaryText}${finishHint}`,
          ),
        });
        state.context.record('write_file', message);
        state.onEvent({
          type: 'observation',
          turn,
          action,
          error: validationFailed,
          message: formatReasoningResult(action, `${message} ${summaryText}`),
          agentRole: state.agentRole,
        });
        if (validationFailed) {
          state.recoveredNoOpWrite = '';
          state.finishAfterAutomaticValidation = false;
          state.automaticValidationResult = '';
          state.forcedWriteRecoveryPending = true;
          state.forcedRecoveryTargetPath = action.path || state.forcedRecoveryTargetPath;
          state.forcedWriteRecoveryViolations = 0;
          state.failedWritePath = action.path || state.failedWritePath;
          state.failedWriteContent =
            state.workspace.files[action.path || ''] || action.content || '';
          state.failedWriteDiagnostic = summaryText;
          return { kind: 'continue' };
        }
        if (state.hostAssistedSession) {
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
          state.context.record('validation', result);
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
        state.recoveredNoOpWrite = fingerprint;
        state.finishAfterAutomaticValidation = true;
        state.automaticValidationResult = result;
        state.lastFingerprint = '';
        state.repeatedActions = 0;
        return { kind: 'continue' };
      } catch (error) {
        if (error instanceof AgentExecutionError) throw error;
        const err = error as Error;
        state.messages.push({
          role: 'user',
          content: observation(action.action, false, err.message),
        });
        state.onEvent({
          type: 'observation',
          turn,
          action,
          error: true,
          message: err.message,
          agentRole: state.agentRole,
        });
        return { kind: 'continue' };
      }
    }
    if (fingerprint === state.lastSuccessfulFingerprint && READ_ONLY_ACTIONS.has(action.action)) {
      const message = `Duplicate ${action.action} skipped — this exact read-only action already returned the same information twice. Reuse the previous result and choose the next productive action.`;
      state.messages.push({ role: 'user', content: observation(action.action, true, message) });
      state.onEvent({
        type: 'observation',
        turn,
        action,
        message,
        agentRole: state.agentRole,
      });
      return { kind: 'continue' };
    }
    const message =
      'This exact action has already run three times in a row without new information. Do not repeat it. Use the results already available and choose the next productive action, such as reading a relevant file, writing the requested change, validating it, or finishing when appropriate.';
    state.messages.push({ role: 'user', content: observation(action.action, false, message) });
    state.onEvent({
      type: 'observation',
      turn,
      action,
      error: true,
      message,
      agentRole: state.agentRole,
    });
    return { kind: 'continue' };
  }
  if (state.repeatedActions >= 3)
    throw new AgentExecutionError(
      'Agent stopped after repeating the same action despite recovery guidance. Staged changes were preserved for review.',
      state.workspace.changes(),
    );
  return { kind: 'proceed' };
};

export const runActionLoopGuards = async (
  state: ActionLoopState,
  turn: number,
  action: ActionLoopAction,
  fingerprint: string,
): Promise<ActionLoopStepOutcome> => {
  const forcedOutcome = await handleForcedWriteViolation(state, turn, action);
  if (forcedOutcome.kind !== 'proceed') return forcedOutcome;

  const deferredOutcome = flushDeferredSourceWrite(state, turn, action);
  if (deferredOutcome.kind !== 'proceed') return deferredOutcome;

  const stuckOutcome = await checkStuckReadAndNonProductive(state, turn, action);
  if (stuckOutcome.kind !== 'proceed') return stuckOutcome;

  return handleRepeatedActionGuards(state, turn, action, fingerprint);
};
