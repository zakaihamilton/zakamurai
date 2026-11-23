import type { RunAgentResult } from '@/components/AI/types';
import { workspaceFulfillsInteractiveRequest } from '../ChangeValidator';
import { AgentExecutionError } from './ActionLoopErrors';
import {
  APP_ENTRY_PATHS,
  CHANGE_REQUEST_PATTERN,
  newlyCreatedComponentsNeedEntryWiring,
  normalizeFinishSummary,
  recoveryWritePath,
  wireNewComponentIntoScratchEntry,
} from './ActionLoopRecovery';
import {
  type ActionLoopAction,
  type ActionLoopState,
  type ActionLoopStepOutcome,
  applyCssModuleRecovery,
} from './ActionLoopState';
import { isFailedValidationResult, missingCssModuleImports, observation } from './ActionLoopUtils';
import { repairProjectStyleRelationships } from './ProjectStyleProfile';

export const handleFinishAction = async (
  state: ActionLoopState,
  turn: number,
  action: ActionLoopAction,
): Promise<Exclude<ActionLoopStepOutcome, { kind: 'proceed' }>> => {
  state.onEvent({ type: 'tool', turn, action, agentRole: state.agentRole });
  if (CHANGE_REQUEST_PATTERN.test(state.request) && state.workspace.changes().length === 0) {
    const target =
      state.forcedRecoveryTargetPath || recoveryWritePath(state.workspace.files, state.activeFile);
    state.forcedWriteRecoveryPending = true;
    state.forcedWriteRecoveryViolations = 0;
    const message = target
      ? `No file changes are staged for this edit request. Return exactly one write_file action for ${target} with the complete implementation before finishing.`
      : 'No file changes are staged for this edit request. Return exactly one write_file action with the complete implementation before finishing.';
    state.messages.push({ role: 'user', content: observation('finish', false, message) });
    state.context.record('finish_recovery', message);
    return { kind: 'continue' };
  }
  if (state.enforceFulfillment && CHANGE_REQUEST_PATTERN.test(state.request)) {
    const fulfillmentError = workspaceFulfillsInteractiveRequest(
      state.workspace.files,
      state.request,
    );
    if (fulfillmentError) {
      const target =
        recoveryWritePath(state.workspace.files, state.activeFile) ||
        [...APP_ENTRY_PATHS].find((path) => Object.hasOwn(state.workspace.files, path)) ||
        'src/App.jsx';
      state.forcedWriteRecoveryPending = true;
      state.forcedRecoveryTargetPath = target;
      state.forcedWriteRecoveryViolations = 0;
      const message = `${fulfillmentError} Do not finish yet. Rewrite ${target} with a complete interactive implementation.`;
      state.messages.push({ role: 'user', content: observation('finish', false, message) });
      state.context.record('finish_fulfillment', message);
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
  if (state.hostAssistedSession) {
    const styleRepair = repairProjectStyleRelationships({
      files: state.workspace.files,
      targetPath: state.lightweightTargetPath,
      requireCoLocated: state.visualMode,
      repair: () => applyCssModuleRecovery(state, turn),
    });
    if (styleRepair) {
      if (styleRepair.remaining.length) {
        const message = `CSS Module contract is incomplete: ${styleRepair.remaining.join(' ')}`;
        state.messages.push({ role: 'user', content: observation('finish', false, message) });
        state.context.record('style_contract', message);
        return { kind: 'continue' };
      }
      state.context.record('style_recovery', `Recovered: ${styleRepair.recovered.join(', ')}`);
    }
  }
  if (state.validationState.lastValidationFailed) {
    const target: string =
      state.forcedRecoveryTargetPath ||
      recoveryWritePath(state.workspace.files, state.activeFile) ||
      'src/App.jsx';
    state.forcedWriteRecoveryPending = true;
    state.forcedRecoveryTargetPath = target;
    const message = `Validation failed for the staged changes. Do not finish yet. Return a corrected write_file for ${target} with complete working source code that builds successfully.`;
    state.messages.push({ role: 'user', content: observation('finish', false, message) });
    state.context.record('finish_failed_validation', message);
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
  if (
    state.previewInspectionRequired &&
    (!state.previewInspectState.inspectedPreview ||
      !state.previewInspectState.previewInspectionAccepted)
  ) {
    if (!state.previewInspectState.inspectedPreview && state.inspectPreview) {
      const previewResult = await state.inspectPreviewForLoop(turn);
      state.onEvent({
        type: 'observation',
        turn,
        action: { action: 'inspect_preview' },
        error: !state.previewInspectState.previewInspectionAccepted,
        message: previewResult,
        agentRole: state.agentRole,
      });
      if (!(state.hostAssistedSession && state.previewInspectState.previewInspectionAccepted)) {
        state.messages.push({
          role: 'user',
          content: observation(
            'inspect_preview',
            state.previewInspectState.previewInspectionAccepted,
            state.previewInspectState.previewInspectionAccepted
              ? `${previewResult}\nReview this preview evidence before choosing the next action.`
              : `${previewResult}\nThe preview is not ready for completion. Fix the rendered app or inspect it again before finishing.`,
          ),
        });
        return { kind: 'continue' };
      }
    } else {
      state.messages.push({
        role: 'user',
        content: observation(
          'finish',
          false,
          state.previewInspectState.previewInspectionAccepted
            ? 'Visual UI review requires action "inspect_preview" before finishing. Use its structured evidence to assess landmarks, named controls, runtime errors, and the visual brief.'
            : 'The previous preview inspection was insufficient. Do not finish. Wait for rendered DOM evidence and a captured screenshot, then inspect_preview again. If the preview remains empty or unstyled, write the necessary JSX/CSS fixes first.',
        ),
      });
      return { kind: 'continue' };
    }
  }
  if (state.validationState.wroteSinceVerification && state.validate) {
    if (state.hostAssistedSession) {
      // Host assistance: omit validate between write and finish for small models.
      const validationResult = await state.runValidation(turn);
      if (isFailedValidationResult(validationResult)) {
        const target: string =
          state.forcedRecoveryTargetPath ||
          recoveryWritePath(state.workspace.files, state.activeFile) ||
          'src/App.jsx';
        state.forcedWriteRecoveryPending = true;
        state.forcedRecoveryTargetPath = target;
        const message = `${validationResult} Do not finish yet. Rewrite ${target} with a complete working implementation.`;
        state.messages.push({ role: 'user', content: observation('finish', false, message) });
        state.context.record('finish_failed_validation', message);
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
    } else {
      state.messages.push({
        role: 'user',
        content: observation(
          'finish',
          false,
          'Validate the staged edits by running action "validate" before finishing.',
        ),
      });
      return { kind: 'continue' };
    }
  }
  const missingStylesheets = [
    ...new Set(
      Object.entries(state.workspace.files).flatMap(([path, content]) =>
        /\.(?:jsx|tsx)$/i.test(path)
          ? missingCssModuleImports(path, content, state.workspace.files)
          : [],
      ),
    ),
  ];
  if (missingStylesheets.length) {
    state.forcedWriteRecoveryPending = true;
    state.forcedRecoveryTargetPath = missingStylesheets[0];
    state.forcedWriteRecoveryViolations = 0;
    state.messages.push({
      role: 'user',
      content: observation(
        'finish',
        false,
        `Create the missing CSS Module files before finishing: ${missingStylesheets.join(', ')}. Your next action must be write_file for ${missingStylesheets[0]}; do not validate or finish again until it exists.`,
      ),
    });
    state.context.record('finish_recovery', missingStylesheets.join(', '));
    state.onEvent({
      type: 'observation',
      turn,
      action,
      error: true,
      message: `Missing CSS Module files: ${missingStylesheets.join(', ')}. Forced stylesheet recovery is active.`,
      agentRole: state.agentRole,
    });
    return { kind: 'continue' };
  }
  const wiredEntry = wireNewComponentIntoScratchEntry(state.workspace);
  const changes = state.workspace.changes();
  const summary = normalizeFinishSummary({
    summary: action.summary,
    request: state.request,
    changeCount: changes.length,
    wiredEntry,
    validationStatus: state.validationState.lastValidationStatus,
  });
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
};

export const finalizeAtSafetyLimit = async (
  state: ActionLoopState,
  maxTurns: number,
): Promise<RunAgentResult> => {
  // Validate a useful draft at the safety limit instead of hiding it behind an error.
  if (state.workspace.changes().length > 0) {
    try {
      applyCssModuleRecovery(state, maxTurns);
      const wiredEntry = wireNewComponentIntoScratchEntry(state.workspace);
      const result = await state.runValidation(maxTurns);
      if (isFailedValidationResult(result)) {
        throw new AgentExecutionError(
          `Final validation failed at the ${maxTurns}-step safety limit: ${result}`,
          state.workspace.changes(),
        );
      }
      const needsEntryWiring = newlyCreatedComponentsNeedEntryWiring(state.workspace);
      const detail = wiredEntry
        ? ` Host recovery wired ${wiredEntry} before validation.`
        : needsEntryWiring
          ? ' The partial draft created new components without wiring them into the application entry point.'
          : '';
      const summary = `The agent reached its ${maxTurns}-step safety limit. Its partial draft passed deterministic validation but remains incomplete and is preserved for review; it was not reported as a completed request.${detail}`;
      state.onEvent({
        type: 'finished',
        turn: maxTurns,
        changes: state.workspace.changes(),
        message: summary,
        agentRole: state.agentRole,
      });
      state.context.record('validation', result);
      return {
        changes: state.workspace.changes(),
        files: state.workspace.files,
        summary,
        events: maxTurns,
        workspace: state.workspace,
      };
    } catch (error) {
      const err = error as Error;
      throw new AgentExecutionError(
        `Agent reached its ${maxTurns}-step safety limit and final validation failed: ${err.message}`,
        state.workspace.changes(),
      );
    }
  }
  throw new AgentExecutionError(`Agent reached its ${maxTurns}-step safety limit.`, []);
};
