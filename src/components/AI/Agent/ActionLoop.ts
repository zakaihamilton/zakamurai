import type { RunAgentOptions, RunAgentResult } from '@/components/AI/types';
import {
  validateAIChanges,
  validateContentSyntax,
  validateFileContentType,
  workspaceFulfillsInteractiveRequest,
} from '../ChangeValidator';
import {
  MAX_RELIABILITY_MODEL_CALLS,
  assertTaskPathAllowed,
  buildTaskContract,
  isTaskPathAllowed,
} from '../ReliabilityContracts';
import { AgentExecutionError, AgentRecoveryValidationError } from './ActionLoopErrors';
import { createAutoFinishContextReadyWrite } from './ActionLoopFastPath';
import {
  type PreviewInspectLoopState,
  createInspectPreviewForLoop,
  inspectConsoleLogs,
  inspectFileSymbols,
  manageWorkspacePackages,
} from './ActionLoopInspect';
import { requestNextAction } from './ActionLoopModel';
import {
  APP_ENTRY_PATHS,
  CHANGE_REQUEST_PATTERN,
  buildActionLoopModelMessages,
  createAutoFinishSummary,
  isIncompleteWriteError,
  loadAskWebLLM,
  newlyCreatedComponentsNeedEntryWiring,
  normalizeFinishSummary,
  recordTruncatedModelOutput,
  recoverDeferredSource,
  recoveryWritePath,
  wireNewComponentIntoScratchEntry,
  writeRecovery,
} from './ActionLoopRecovery';
import { createActionLoopOpening } from './ActionLoopSession';
import { isNewAppGenerationRequest } from './ActionLoopSmallModel';
import {
  NON_PRODUCTIVE_ACTIONS,
  READ_ONLY_ACTIONS,
  appendMissingCssModuleRules,
  cssModuleRecovery,
  formatReasoningResult,
  formatValidationSummary,
  incompleteCssModuleImports,
  isFailedValidationResult,
  missingCssModuleImports,
  observation,
  recoverWorkspaceCssModules,
} from './ActionLoopUtils';
import { type ActionLoopValidationState, createValidationRunner } from './ActionLoopValidation';
import {
  applyReplaceFileContent,
  assertDeletableFile,
  prepareWriteFileAction,
} from './ActionLoopWrites';
import { AgentContextManager, formatVerificationResult } from './ContextManager';
import { parseModelResult } from './ManagerProtocol';
import { listProjectChecks, runProjectCheck } from './ProjectChecks';
import {
  ensureProjectRootTokens,
  projectStyleGenerationTrace,
  projectStyleRecoveryTrace,
  repairProjectStyleRelationships,
} from './ProjectStyleProfile';
import { AGENT_SYSTEM_PROMPT, ALL_AGENT_ACTIONS, parseAgentAction } from './Protocol';
import { visualPreviewInspectionFailure } from './VisualPreviewEvidence';
import { AgentWorkspace } from './Workspace';

export async function runActionLoop({
  request,
  scope = 'file',
  activeFile,
  selectedLines = [],
  files,
  model,
  sessionId,
  validate,
  runProjectCheck: executeProjectCheck,
  inspectPreview,
  retrieveContext,
  signal,
  onEvent = () => {},
  onMetrics,
  maxTurns = MAX_RELIABILITY_MODEL_CALLS,
  systemPrompt = AGENT_SYSTEM_PROMPT,
  allowedActions = ALL_AGENT_ACTIONS,
  priorContext = '',
  workspace: existingWorkspace = null,
  agentRole = null,
  workspaceIndex = null,
  visualMode = false,
  requirePreviewInspection = false,
  modelClient,
  modelSession,
  styleProfile,
  seed,
}: RunAgentOptions): Promise<RunAgentResult> {
  const askWebLLM = modelClient ? null : await loadAskWebLLM();
  const workspace = existingWorkspace || new AgentWorkspace(files, workspaceIndex);
  const taskContract = buildTaskContract({ request, scope, activeFile, files });
  const context = new AgentContextManager({ request, priorContext });
  const {
    lightweightModel,
    contextReady,
    hostAssistedWrite,
    enforceFulfillment,
    hostAssistedSession,
    effectiveAllowedActions,
    lightweightTargetPath,
    resolvedStyleProfile,
    messages,
  } = createActionLoopOpening({
    request,
    scope,
    activeFile,
    selectedLines,
    files: workspace.files,
    model,
    priorContext,
    agentRole,
    systemPrompt,
    allowedActions,
    visualMode,
    styleProfile,
    conversationContext: context.toString(),
  });
  const previewInspectionRequired = requirePreviewInspection && Boolean(inspectPreview);
  let protocolFailures = 0;
  let lastFingerprint = '';
  let repeatedActions = 0;
  let lastSuccessfulFingerprint = '';
  const validationState: ActionLoopValidationState = {
    wroteSinceVerification: false,
    lastValidationFailed: false,
    lastValidationStatus: 'unavailable',
    repairAttempts: 0,
  };
  const previewInspectState: PreviewInspectLoopState = {
    inspectedPreview: false,
    previewInspectionAccepted: false,
    lastPreviewResult: '',
  };
  let recoveredNoOpWrite = '';
  let finishAfterAutomaticValidation = false;
  let automaticValidationResult = '';
  let failedWritePath = '';
  let failedWriteContent = '';
  let failedWriteDiagnostic = '';
  let forcedWriteRecoveryPending = false;
  let forcedRecoveryTargetPath: string | null = null;
  let forcedWriteRecoveryViolations = 0;
  let directChangesRecoveryPending = false;
  let deferredSourceWrite: { path: string; content: string; stylesheets: string[] } | null = null;
  const lastReadContents = new Map<string, string>();
  let unchangedReadSkips = 0;
  let nonProductiveActionsWithoutWrite = 0;
  let directRepairAttempts = 0;
  let incompleteWriteRetries = 0;
  let failedWriteAttempts = 0;
  let malformedSourceAttempts = 0;
  const failedStylesheetWrites = new Map<string, number>();
  // Manager context permits only one redundant inspection before forcing a write.
  const nonProductiveActionLimit = contextReady ? 1 : lightweightModel ? 2 : 4;
  // Lightweight models stay on fence-only recovery longer.
  const forcedRecoveryViolationLimit = lightweightModel ? 4 : 2;
  const incompleteWriteRetryLimit = lightweightModel ? 3 : 2;
  // Incomplete metadata ↔ prose oscillation has a bounded retry budget.
  const failedWriteAttemptLimit = lightweightModel ? 5 : 6;
  const malformedSourceAttemptLimit = lightweightModel ? 3 : 4;
  const validationRepairLimit = taskContract.maxRepairRounds;

  const recordFailedWriteAttempt = (target: string): void => {
    failedWriteAttempts += 1;
    if (failedWriteAttempts < failedWriteAttemptLimit) return;
    throw new AgentExecutionError(
      `The local model repeatedly failed to write valid source for ${target} (${failedWriteAttempts} attempts with incomplete or non-code content). Staged changes were preserved for review; retry with a stronger model or a narrower request.`,
      workspace.changes(),
    );
  };

  const clearFailedWriteAttempts = (): void => {
    failedWriteAttempts = 0;
    incompleteWriteRetries = 0;
  };

  const stageRecoveredWrite = (turn: number, path: string, content: string): void => {
    workspace.write(path, content);
    onEvent({
      type: 'tool',
      turn,
      action: { action: 'write_file', path, content },
      agentRole,
      provenance: 'recovery',
    });
  };

  const stageDeferredRecovery = (
    source: { path: string; content: string },
    turn: number,
    action: NonNullable<ReturnType<typeof parseAgentAction>>,
  ): string | null => {
    const recovery = recoverDeferredSource({
      source,
      files: workspace.files,
      request,
      lightweight: lightweightModel,
      turn,
      action,
      agentRole,
      onEvent,
      fulfills: workspaceFulfillsInteractiveRequest,
    });
    if (!recovery) return null;
    failedWritePath = recovery.path;
    failedWriteContent = recovery.content;
    failedWriteDiagnostic = recovery.diagnostic;
    forcedWriteRecoveryPending = true;
    return recovery.diagnostic;
  };

  const applyCssModuleRecovery = (turn: number): string[] => {
    const recovered = recoverWorkspaceCssModules(workspace.files, resolvedStyleProfile);
    for (const { path, content } of recovered) stageRecoveredWrite(turn, path, content);
    const trace = projectStyleRecoveryTrace(
      workspace.files,
      recovered.map(({ path }) => path),
      resolvedStyleProfile,
    );
    if (trace) context.record('style_recovery', trace);
    return recovered.map((entry) => entry.path);
  };

  const autoFinishSummary = (
    reason: 'validate' | 'fulfillment' | 'identical-write' | 'unchanged-reads' | 'safety-limit',
    wiredEntry: string | null,
  ): string =>
    createAutoFinishSummary(request)(reason, wiredEntry, validationState.lastValidationStatus);
  const runValidation = createValidationRunner({
    workspace,
    validate,
    onEvent,
    agentRole,
    context,
    state: validationState,
    validationRepairLimit,
  });
  const inspectPreviewForLoop = createInspectPreviewForLoop({
    state: previewInspectState,
    files: workspace.files,
    inspectPreview,
    previewInspectionRequired,
    resolvedStyleProfile,
    applyCssModuleRecovery,
    context,
    onEvent,
    agentRole,
  });
  const finishContextReadyWrite = createAutoFinishContextReadyWrite({
    request,
    workspace,
    lightweightTargetPath,
    visualMode,
    previewInspectionRequired,
    previewInspectState,
    applyCssModuleRecovery,
    inspectPreviewForLoop,
    hasValidation: Boolean(validate),
    runValidation,
    validationState,
    onEvent,
    agentRole,
    context,
  });
  for (let turn = 1; turn <= maxTurns; turn++) {
    if (signal?.aborted) throw new DOMException('Agent stopped', 'AbortError');
    onEvent({
      type: 'thinking',
      turn,
      agentRole,
      message:
        turn === 1
          ? 'Reviewing the request and available workspace context before choosing an action…'
          : 'Requesting the next action from the local model...',
    });
    let reply: string;
    const recoveryTarget =
      forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
    const modelMessages = buildActionLoopModelMessages({
      request,
      targetPath: recoveryTarget,
      files: workspace.files,
      failedWritePath,
      failedWriteContent,
      failedWriteDiagnostic,
      directChangesRecoveryPending,
      forcedWriteRecoveryPending,
      incompleteWriteRetries,
      lightweight: lightweightModel,
      messages,
    });
    const safeModelMessages = modelMessages.filter(Boolean);
    const modelResponse = await requestNextAction({
      askWebLLM,
      modelSession,
      modelClient,
      model,
      messages: modelMessages,
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
    });
    reply = modelResponse.text;
    onEvent({
      type: 'model_io',
      turn,
      agentRole,
      input: safeModelMessages
        .map((message) => `[${message.role}]\n${message.content}`)
        .join('\n\n'),
      output: reply,
    });

    if (modelResponse.finishReason === 'length') {
      const target: string =
        forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile) || 'src/App.jsx';
      incompleteWriteRetries += 1;
      forcedWriteRecoveryPending = true;
      forcedRecoveryTargetPath = target;
      failedWritePath = target;
      recordTruncatedModelOutput({ turn, target, agentRole, messages, context, onEvent });
      if (incompleteWriteRetries >= incompleteWriteRetryLimit) {
        throw new AgentExecutionError(
          `The local model repeatedly reached the output token limit while generating ${target}. Staged changes were preserved for review; retry with a stronger model or a narrower request.`,
          workspace.changes(),
        );
      }
      continue;
    }
    messages.push({ role: 'assistant', content: reply });
    let action: ReturnType<typeof parseAgentAction> | undefined;
    try {
      action = parseAgentAction(reply, {
        allowedActions: effectiveAllowedActions,
        // Bind common source-only replies to the known entry path.
        defaultWritePath:
          forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile),
      });
      protocolFailures = 0;
    } catch (error) {
      const err = error as Error;
      const replyText = typeof reply === 'string' ? reply : '';
      try {
        const directResult = parseModelResult(replyText);
        if (directResult.kind === 'changes' && directResult.changes.length) {
          const changes = directResult.changes.map((change) => ({
            ...change,
            path: change.path || change.filePath || '',
            ...(typeof change.content === 'string' ? { after: change.content } : {}),
            ...(change.before === undefined
              ? { before: workspace.files[change.path || change.filePath || ''] }
              : {}),
          }));
          const validation = validateAIChanges(changes);
          const outsideContract = validation.accepted.find(
            (change) => !isTaskPathAllowed(taskContract, change.path),
          );
          if (outsideContract) {
            validation.rejected.push(
              `Target path is outside the task contract: ${outsideContract.path}`,
            );
          }
          if (validation.rejected.length || !validation.accepted.length) {
            messages.push({
              role: 'user',
              content: observation(
                'changes',
                false,
                validation.rejected.join('\n') || 'No usable changes were returned.',
              ),
            });
            continue;
          }
          for (const change of validation.accepted) {
            if (change.after === undefined) workspace.delete(change.path);
            else workspace.write(change.path, change.after);
          }
          clearFailedWriteAttempts();
          let verification = '';
          if (validate) {
            verification = await runValidation(
              turn,
              directChangesRecoveryPending || forcedWriteRecoveryPending ? 'recovery' : 'model',
            );
          }
          if (verification.includes('"status":"failed"')) {
            if (++directRepairAttempts > 2)
              throw new AgentExecutionError(verification, workspace.changes());
            failedWritePath =
              changes.find((change) => change.after !== undefined)?.path ||
              recoveryWritePath(workspace.files, activeFile) ||
              '';
            failedWriteContent = failedWritePath ? workspace.files[failedWritePath] || '' : '';
            failedWriteDiagnostic = verification;
            forcedWriteRecoveryPending = Boolean(failedWritePath);
            forcedRecoveryTargetPath = failedWritePath || forcedRecoveryTargetPath;
            messages.push({
              role: 'user',
              content: observation(
                'validate',
                false,
                `${verification}\nReturn a corrected kind=changes response with complete file contents.`,
              ),
            });
            continue;
          }
          let previewSummary = '';
          if (previewInspectionRequired && !previewInspectState.inspectedPreview) {
            onEvent({ type: 'tool', turn, action: { action: 'inspect_preview' }, agentRole });
            const preview = inspectPreview
              ? await inspectPreview(workspace.files)
              : { status: 'unavailable', diagnostics: 'Preview inspection is unavailable.' };
            previewInspectState.inspectedPreview = true;
            const previewFailure = visualPreviewInspectionFailure(preview);
            previewInspectState.previewInspectionAccepted = !previewFailure;
            if (inspectPreview) {
              previewSummary = `\n\nPreview inspection:\n${JSON.stringify(
                previewFailure
                  ? {
                      ...(typeof preview === 'object' && preview ? preview : {}),
                      visualReview: 'insufficient',
                      diagnostics: previewFailure,
                    }
                  : preview,
              )}`;
            }
            if (previewFailure) {
              messages.push({
                role: 'user',
                content: observation('inspect_preview', false, previewFailure),
              });
              continue;
            }
          }
          const changesResult = workspace.changes();
          const summary =
            directResult.summary || `Prepared ${changesResult.length} file(s) for review.`;
          onEvent({
            type: 'finished',
            turn,
            changes: changesResult,
            message: summary,
            agentRole,
            provenance:
              directChangesRecoveryPending || forcedWriteRecoveryPending ? 'recovery' : 'model',
          });
          return {
            changes: changesResult,
            files: workspace.files,
            summary: `${summary}${previewSummary}`,
            events: turn,
            workspace,
          };
        }
        if (directResult.kind === 'answer') {
          if (hostAssistedSession && workspace.changes().length > 0 && validate) {
            try {
              applyCssModuleRecovery(turn);
              const validationResult = await runValidation(turn);
              if (!isFailedValidationResult(validationResult)) {
                const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
                const changes = workspace.changes();
                const summary = autoFinishSummary('validate', wiredEntry);
                onEvent({ type: 'finished', turn, changes, message: summary, agentRole });
                context.record('validation', validationResult);
                return { changes, files: workspace.files, summary, events: turn, workspace };
              }
            } catch {}
          }
          messages.push({
            role: 'user',
            content: observation(
              'changes',
              false,
              'The previous model response did not return any changes for an edit request. return changes for an edit request as a complete kind=changes response with at least one file change.',
            ),
          });
          continue;
        }
      } catch (directError) {
        if (directError instanceof AgentExecutionError) throw directError;
      }
      protocolFailures++;
      if (isIncompleteWriteError(err.message)) {
        incompleteWriteRetries += 1;
        const target: string =
          forcedRecoveryTargetPath ||
          recoveryWritePath(workspace.files, activeFile) ||
          'src/App.jsx';
        forcedWriteRecoveryPending = true;
        forcedRecoveryTargetPath = target;
        if (incompleteWriteRetries <= incompleteWriteRetryLimit) {
          // Give the first metadata-only reply a free retry; later incompletes count.
          if (incompleteWriteRetries > 1) {
            recordFailedWriteAttempt(target);
          }
          const recoveryMessage = lightweightModel
            ? `write_file metadata was returned without source content. Reply with ONLY a labelled code fence containing the complete source for ${target}. Do not return JSON.`
            : `write_file metadata was returned without source content. Reply again with write_file for ${target} and include the complete file body in the same response (a labelled code fence immediately after the JSON line).`;
          messages.push({
            role: 'user',
            content: observation('protocol', false, recoveryMessage),
          });
          context.record('incomplete_write_recovery', recoveryMessage);
          onEvent({
            type: 'observation',
            turn,
            action: { action: 'write_file', path: target },
            error: true,
            message: recoveryMessage,
            agentRole,
          });
          continue;
        }
        recordFailedWriteAttempt(target);
      }
      if (forcedWriteRecoveryPending) {
        if (++forcedWriteRecoveryViolations >= forcedRecoveryViolationLimit) {
          if (!directChangesRecoveryPending) {
            directChangesRecoveryPending = true;
            const target =
              forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
            const recoveryMessage = lightweightModel
              ? target
                ? `Fence-only recovery is active. Reply with ONLY a labelled code fence containing complete source for ${target}. Do not return JSON.`
                : 'Fence-only recovery is active. Reply with ONLY a labelled code fence containing complete source. Do not return JSON.'
              : target
                ? `Direct recovery is active. Return one kind=changes response containing complete content for ${target}. Do not return another action.`
                : 'Direct recovery is active. Return one kind=changes response containing complete file contents. Do not return another action.';
            messages.push({
              role: 'user',
              content: observation('direct_recovery', false, recoveryMessage),
            });
            context.record('direct_recovery', recoveryMessage);
            onEvent({
              type: 'observation',
              turn,
              action: { action: 'write_file', path: target || undefined },
              error: true,
              message: `${err.message}. ${recoveryMessage}`,
              agentRole,
            });
            continue;
          }
          throw new AgentExecutionError(
            'The local model could not provide a write_file action after forced recovery. Staged changes were preserved for review; retry with a stronger model or a narrower request.',
            workspace.changes(),
          );
        }
        const target = forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
        const recoveryMessage = lightweightModel
          ? `Recovery mode is active. Reply with ONLY a labelled code fence containing complete source${target ? ` for ${target}` : ''}. Do not return JSON, list_files, validate, or prose.`
          : `Recovery mode is active. Return exactly one write_file action${target ? ` for ${target}` : ''} with complete source content. Do not use list_files, validate, inspect_preview, or prose.`;
        messages.push({
          role: 'user',
          content: observation('protocol', false, `${err.message}. ${recoveryMessage}`),
        });
        context.record('stuck_read_recovery', recoveryMessage);
        onEvent({
          type: 'observation',
          turn,
          action: { action: 'write_file', path: target || undefined },
          error: true,
          message: `${err.message}. ${recoveryMessage}`,
          agentRole,
        });
        continue;
      }
      if (finishAfterAutomaticValidation && workspace.changes().length > 0) {
        applyCssModuleRecovery(turn);
        const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
        const changes = workspace.changes();
        const summary = autoFinishSummary('identical-write', wiredEntry);
        onEvent({ type: 'finished', turn, changes, message: summary, agentRole });
        context.record('validation', automaticValidationResult || 'passed');
        return { changes, files: workspace.files, summary, events: turn, workspace };
      }
      if (
        hostAssistedSession &&
        workspace.changes().length > 0 &&
        (validate || isNewAppGenerationRequest(request))
      ) {
        try {
          applyCssModuleRecovery(turn);
          const fulfillmentError = isNewAppGenerationRequest(request)
            ? workspaceFulfillsInteractiveRequest(workspace.files, request)
            : null;
          if (fulfillmentError) throw new Error(fulfillmentError);
          const validationResult = validate
            ? await runValidation(turn)
            : 'Deterministic request-fulfillment checks passed.';
          if (!validate || !isFailedValidationResult(validationResult)) {
            const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
            const changes = workspace.changes();
            const summary = autoFinishSummary(validate ? 'validate' : 'fulfillment', wiredEntry);
            onEvent({ type: 'finished', turn, changes, message: summary, agentRole });
            context.record(validate ? 'validation' : 'fulfillment', validationResult);
            return { changes, files: workspace.files, summary, events: turn, workspace };
          }
        } catch {}
      }
      if (protocolFailures >= 4)
        throw new Error(
          `Local model could not follow the agent protocol after recovery: ${err.message}`,
        );
      const incompleteWriteGuidance = lightweightModel
        ? `${err.message}. Reply with ONLY a labelled code fence containing complete source code for ${
            forcedRecoveryTargetPath ||
            recoveryWritePath(workspace.files, activeFile) ||
            'the target file'
          }. Do not return JSON or prose.`
        : isIncompleteWriteError(err.message)
          ? `${err.message}. Return write_file again with the complete file content in the same response.`
          : `${err.message}. Do not write prose. Reply with exactly one JSON action that advances the request (prefer write_file with complete content for an edit request).`;
      messages.push({
        role: 'user',
        content: observation('protocol', false, incompleteWriteGuidance),
      });
      continue;
    }
    const fingerprint = JSON.stringify(action);
    if (forcedWriteRecoveryPending && action.action !== 'write_file') {
      forcedWriteRecoveryViolations += 1;
      if (forcedWriteRecoveryViolations === 1 && workspace.changes().length === 0) {
        directChangesRecoveryPending = true;
        const target = forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
        const recoveryMessage = lightweightModel
          ? `Fence-only recovery is active. Reply with ONLY a labelled code fence containing complete source${target ? ` for ${target}` : ''}. Do not return another action.`
          : `Direct recovery is active. Return one kind=changes response containing complete content${target ? ` for ${target}` : ''}. Do not return another action.`;
        messages.push({
          role: 'user',
          content: observation('direct_recovery', false, recoveryMessage),
        });
        context.record('direct_recovery', recoveryMessage);
        continue;
      }
      if (forcedWriteRecoveryViolations >= 2) {
        if (workspace.changes().length > 0) {
          const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
          const result = await runValidation(turn);
          if (isFailedValidationResult(result)) {
            throw new AgentRecoveryValidationError(
              `Validation failed after forced write recovery: ${result}`,
              workspace.changes(),
            );
          }
          const summary = wiredEntry
            ? `Validated staged changes after forced write recovery limit reached and wired ${wiredEntry}.`
            : 'Validated staged changes after forced write recovery limit reached.';
          onEvent({
            type: 'finished',
            turn,
            changes: workspace.changes(),
            message: summary,
            agentRole,
          });
          context.record('validation', result);
          return {
            changes: workspace.changes(),
            files: workspace.files,
            summary,
            events: turn,
            workspace,
          };
        }
        if (!directChangesRecoveryPending) {
          directChangesRecoveryPending = true;
          const target = forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
          const recoveryMessage = lightweightModel
            ? target
              ? `Fence-only recovery is active. Reply with ONLY a labelled code fence containing complete source for ${target}. Do not return another action.`
              : 'Fence-only recovery is active. Reply with ONLY a labelled code fence containing complete source. Do not return another action.'
            : target
              ? `Direct recovery is active. Return one kind=changes response containing complete content for ${target}. Do not return another action.`
              : 'Direct recovery is active. Return one kind=changes response containing complete file contents. Do not return another action.';
          messages.push({
            role: 'user',
            content: observation('direct_recovery', false, recoveryMessage),
          });
          context.record('direct_recovery', recoveryMessage);
          continue;
        }
        throw new AgentExecutionError(
          'The local model repeatedly read unchanged files without editing, including after a forced write recovery. It was stopped early to avoid exhausting the step limit; retry with a stronger model or a narrower request.',
          workspace.changes(),
        );
      }
      const target = forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
      const message = lightweightModel
        ? target
          ? `Recovery mode is active. Do not inspect files again. Reply with ONLY a labelled code fence containing complete source for ${target}.`
          : 'Recovery mode is active. Do not inspect files again. Reply with ONLY a labelled code fence containing complete source.'
        : target
          ? `Recovery mode is active. Do not inspect files again. Your next response must be a write_file action for ${target} with complete source content that fulfills the original request.`
          : 'Recovery mode is active. Do not inspect files again. Your next response must be a write_file action that fulfills the original request.';
      messages.push({ role: 'user', content: observation(action.action, false, message) });
      context.record('stuck_read_recovery', message);
      onEvent({ type: 'observation', turn, action, error: true, message, agentRole });
      continue;
    }
    if (
      deferredSourceWrite &&
      !(
        action.action === 'write_file' &&
        deferredSourceWrite.stylesheets.includes(action.path || '')
      )
    ) {
      const source = deferredSourceWrite;
      for (const stylesheet of source.stylesheets) {
        stageRecoveredWrite(
          turn,
          stylesheet,
          cssModuleRecovery(source.content, resolvedStyleProfile, stylesheet),
        );
      }
      stageRecoveredWrite(turn, source.path, source.content);
      validationState.wroteSinceVerification = true;
      deferredSourceWrite = null;
      const recoveryMessage = stageDeferredRecovery(source, turn, action);
      if (recoveryMessage) {
        messages.push({
          role: 'user',
          content: observation('css_recovery', false, recoveryMessage),
        });
        continue;
      }
      forcedWriteRecoveryPending = false;
      forcedRecoveryTargetPath = null;
      const message = `The model did not provide the requested CSS Module, so staged ${source.path} with generated semantic CSS recovery for ${source.stylesheets.join(', ')}.`;
      messages.push({ role: 'user', content: observation('css_recovery', true, message) });
      context.record('css_recovery', message);
      onEvent({ type: 'observation', turn, action, message, agentRole });
      // Lightweight finish can proceed on the recovered workspace.
      if (!(hostAssistedSession && action.action === 'finish')) continue;
    }
    if (
      CHANGE_REQUEST_PATTERN.test(request) &&
      NON_PRODUCTIVE_ACTIONS.has(action.action) &&
      workspace.changes().length === 0
    ) {
      nonProductiveActionsWithoutWrite++;
      if (
        nonProductiveActionsWithoutWrite >= nonProductiveActionLimit &&
        !forcedWriteRecoveryPending
      ) {
        const target = forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
        forcedWriteRecoveryPending = true;
        const message = `Recovery mode: the workspace has already been inspected. Do not list, search, or read files again. Your next response must be a write_file action${target ? ` for ${target}` : ''} that fulfills the original request, with complete source content. Only call finish if no code change is needed.`;
        messages.push({
          content: observation('stuck_read_recovery', false, message),
          role: 'user',
        });
        context.record('stuck_read_recovery', message);
        onEvent({ type: 'observation', turn, action, error: true, message, agentRole });
        continue;
      }
    }
    if (action.action === 'read_file') {
      const path = action.path || '';
      const content = workspace.files[path];
      if (lastReadContents.has(path) && lastReadContents.get(path) === content) {
        const message = `Duplicate read_file skipped — ${path} has not changed since it was last read. Reuse the existing result and take a productive action.`;
        messages.push({ role: 'user', content: observation(action.action, true, message) });
        context.record('read_file', message);
        onEvent({ type: 'observation', turn, action, message, agentRole });
        unchangedReadSkips++;
        // Prompt small models for a productive write while context is fresh.
        if (unchangedReadSkips === 1 && workspace.changes().length === 0) {
          const target = forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
          forcedWriteRecoveryPending = true;
          const recoveryMsg = `Recovery mode: the workspace has already been inspected. Do not list, search, or read files again. Your next response must be a write_file action${target ? ` for ${target}` : ''} that fulfills the original request, with complete source content. Only call finish if no code change is needed.`;
          messages.push({
            role: 'user',
            content: observation('stuck_read_recovery', false, recoveryMsg),
          });
          continue;
        }
        if (unchangedReadSkips >= 2 && workspace.changes().length === 0) {
          throw new AgentExecutionError(
            'The local model repeatedly read unchanged files without editing, including after a forced write recovery. It was stopped early to avoid exhausting the step limit; retry with a stronger model or a narrower request.',
            [],
          );
        }
        if (unchangedReadSkips >= 2 && workspace.changes().length > 0) {
          applyCssModuleRecovery(turn);
          const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
          const result = await runValidation(turn);
          if (isFailedValidationResult(result)) {
            throw new AgentRecoveryValidationError(
              `Validation failed after repeated unchanged reads: ${result}`,
              workspace.changes(),
            );
          }
          const summary = autoFinishSummary('unchanged-reads', wiredEntry);
          onEvent({
            type: 'finished',
            turn,
            changes: workspace.changes(),
            message: summary,
            agentRole,
          });
          context.record('validation', result);
          return {
            changes: workspace.changes(),
            files: workspace.files,
            summary,
            events: turn,
            workspace,
          };
        }
        continue;
      }
    }
    if (fingerprint === recoveredNoOpWrite) {
      applyCssModuleRecovery(turn);
      const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
      const summary = autoFinishSummary('identical-write', wiredEntry);
      const changes = workspace.changes();
      onEvent({ type: 'finished', turn, changes, message: summary, agentRole });
      return { changes, files: workspace.files, summary, events: turn, workspace };
    }
    if (recoveredNoOpWrite) recoveredNoOpWrite = '';
    repeatedActions = fingerprint === lastFingerprint ? repeatedActions + 1 : 0;
    lastFingerprint = fingerprint;
    const writePath = action.action === 'write_file' ? action.path || '' : '';
    const isRepeatedSavedWrite =
      action.action === 'write_file' &&
      ((Object.hasOwn(workspace.files, writePath) &&
        workspace.files[writePath] === (action.content || '')) ||
        // Normalization can make a repeated raw write differ from the staged file.
        (fingerprint === lastSuccessfulFingerprint && workspace.changes().length > 0));
    // Finish on the second consecutive validate when staged work already exists.
    if (
      action.action === 'validate' &&
      workspace.changes().length > 0 &&
      (repeatedActions >= 1 || finishAfterAutomaticValidation)
    ) {
      if (
        finishAfterAutomaticValidation &&
        previewInspectionRequired &&
        (!previewInspectState.inspectedPreview || !previewInspectState.previewInspectionAccepted)
      ) {
        const previewResult = await inspectPreviewForLoop(turn);
        if (!previewInspectState.previewInspectionAccepted) {
          finishAfterAutomaticValidation = false;
          messages.push({
            role: 'user',
            content: observation(
              'inspect_preview',
              false,
              `${previewResult}\nThe preview is not ready for completion. Fix the rendered app or inspect it again before finishing.`,
            ),
          });
          continue;
        }
      }
      const validationResult = finishAfterAutomaticValidation
        ? automaticValidationResult
        : await runValidation(turn);
      finishAfterAutomaticValidation = false;
      automaticValidationResult = '';
      applyCssModuleRecovery(turn);
      const result = validationResult;
      if (isFailedValidationResult(result)) {
        failedWritePath =
          forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile) || '';
        failedWriteContent = failedWritePath ? workspace.files[failedWritePath] || '' : '';
        failedWriteDiagnostic = result;
        forcedWriteRecoveryPending = Boolean(failedWritePath);
        forcedRecoveryTargetPath = failedWritePath || forcedRecoveryTargetPath;
        messages.push({ role: 'user', content: observation(action.action, false, result) });
        onEvent({
          type: 'observation',
          turn,
          action,
          error: true,
          message: result,
          agentRole,
        });
        continue;
      }
      const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
      const changes = workspace.changes();
      const summary = autoFinishSummary('validate', wiredEntry);
      onEvent({ type: 'finished', turn, changes, message: summary, agentRole });
      context.record('validation', result);
      return { changes, files: workspace.files, summary, events: turn, workspace };
    }
    if (repeatedActions === 2 || (repeatedActions === 1 && isRepeatedSavedWrite)) {
      if (isRepeatedSavedWrite) {
        const message = `The proposed write to ${action.path} is already staged with identical content. Automatically validating the workspace instead of rewriting it.`;
        try {
          applyCssModuleRecovery(turn);
          const result = await runValidation(turn);
          const validationFailed = isFailedValidationResult(result);
          const summaryText = formatValidationSummary(result);
          const finishHint = validationFailed
            ? ' Validation failed for the staged changes. Do not finish. Return a corrected write_file action with complete working source.'
            : ' Validation passed for the staged changes. Your next action must be finish with a brief summary. Do not rewrite or validate again.';
          messages.push({
            role: 'user',
            content: observation(
              action.action,
              !validationFailed,
              `${message}\n${summaryText}${finishHint}`,
            ),
          });
          context.record('write_file', message);
          onEvent({
            type: 'observation',
            turn,
            action,
            error: validationFailed,
            message: formatReasoningResult(action, `${message} ${summaryText}`),
            agentRole,
          });
          if (validationFailed) {
            recoveredNoOpWrite = '';
            finishAfterAutomaticValidation = false;
            automaticValidationResult = '';
            forcedWriteRecoveryPending = true;
            forcedRecoveryTargetPath = action.path || forcedRecoveryTargetPath;
            forcedWriteRecoveryViolations = 0;
            failedWritePath = action.path || failedWritePath;
            failedWriteContent = workspace.files[action.path || ''] || action.content || '';
            failedWriteDiagnostic = summaryText;
            continue;
          }
          if (hostAssistedSession) {
            const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
            const changes = workspace.changes();
            const summary = autoFinishSummary('identical-write', wiredEntry);
            onEvent({ type: 'finished', turn, changes, message: summary, agentRole });
            context.record('validation', result);
            return { changes, files: workspace.files, summary, events: turn, workspace };
          }
          recoveredNoOpWrite = fingerprint;
          finishAfterAutomaticValidation = true;
          automaticValidationResult = result;
          lastFingerprint = '';
          repeatedActions = 0;
          continue;
        } catch (error) {
          if (error instanceof AgentExecutionError) throw error;
          const err = error as Error;
          messages.push({ role: 'user', content: observation(action.action, false, err.message) });
          onEvent({
            type: 'observation',
            turn,
            action,
            error: true,
            message: err.message,
            agentRole,
          });
          continue;
        }
      }
      if (fingerprint === lastSuccessfulFingerprint && READ_ONLY_ACTIONS.has(action.action)) {
        const message = `Duplicate ${action.action} skipped — this exact read-only action already returned the same information twice. Reuse the previous result and choose the next productive action.`;
        messages.push({ role: 'user', content: observation(action.action, true, message) });
        onEvent({
          type: 'observation',
          turn,
          action,
          message,
          agentRole,
        });
        continue;
      }
      const message =
        'This exact action has already run three times in a row without new information. Do not repeat it. Use the results already available and choose the next productive action, such as reading a relevant file, writing the requested change, validating it, or finishing when appropriate.';
      messages.push({ role: 'user', content: observation(action.action, false, message) });
      onEvent({
        type: 'observation',
        turn,
        action,
        error: true,
        message,
        agentRole,
      });
      continue;
    }
    if (repeatedActions >= 3)
      throw new AgentExecutionError(
        'Agent stopped after repeating the same action despite recovery guidance. Staged changes were preserved for review.',
        workspace.changes(),
      );
    try {
      let result: string | undefined;
      if (action.action === 'list_files') {
        onEvent({ type: 'tool', turn, action, agentRole });
        result = workspace.list(action.query).join('\n');
      }
      if (action.action === 'search_workspace') {
        onEvent({ type: 'tool', turn, action, agentRole });
        result = String(await workspace.search(action.query || '', action.glob));
      }
      if (action.action === 'search_semantic') {
        onEvent({ type: 'tool', turn, action, agentRole });
        if (!retrieveContext) throw new Error('Semantic search is unavailable in this session.');
        result = await workspace.semanticSearch(action.query || '', retrieveContext, action.k);
      }
      if (action.action === 'read_file') {
        onEvent({ type: 'tool', turn, action, agentRole });
        const path = action.path || '';
        if (Object.hasOwn(workspace.files, path)) {
          result = workspace.read(path);
          lastReadContents.set(path, workspace.files[path]);
        } else {
          result = `File not found: ${path}. Do not read it again. If you need a new component or stylesheet there, create it with write_file; otherwise continue with the existing workspace files.`;
        }
      }
      if (action.action === 'write_file') {
        assertTaskPathAllowed(taskContract, action.path || '');
        const prepared = prepareWriteFileAction({
          action,
          files: workspace.files,
          request,
          styleProfile: resolvedStyleProfile,
          lightweightModel: enforceFulfillment,
        });
        action = prepared.action;
        const { normalizedSideEffectCss, rewrittenInlineStyles, ensuredCssModule } = prepared;
        workspace.write(action.path || '', action.content || '');
        previewInspectState.inspectedPreview = false;
        previewInspectState.previewInspectionAccepted = false;
        previewInspectState.lastPreviewResult = '';
        finishAfterAutomaticValidation = false;
        automaticValidationResult = '';
        nonProductiveActionsWithoutWrite = 0;
        validationState.wroteSinceVerification = true;
        failedWritePath = '';
        failedWriteContent = '';
        failedWriteDiagnostic = '';
        unchangedReadSkips = 0;
        clearFailedWriteAttempts();
        malformedSourceAttempts = 0;
        forcedWriteRecoveryPending = false;
        forcedRecoveryTargetPath = null;
        forcedWriteRecoveryViolations = 0;
        failedStylesheetWrites.delete(action.path || '');
        if (normalizedSideEffectCss) {
          for (const stylesheet of normalizedSideEffectCss.stylesheets) {
            if (Object.hasOwn(workspace.files, stylesheet)) continue;
            stageRecoveredWrite(
              turn,
              stylesheet,
              cssModuleRecovery(action.content || '', resolvedStyleProfile, stylesheet),
            );
          }
        }
        if (rewrittenInlineStyles) {
          const existing = workspace.files[rewrittenInlineStyles.stylesheetPath] || '';
          stageRecoveredWrite(
            turn,
            rewrittenInlineStyles.stylesheetPath,
            existing
              ? `${existing.trimEnd()}\n\n${rewrittenInlineStyles.stylesheet}`
              : rewrittenInlineStyles.stylesheet,
          );
        } else if (
          ensuredCssModule &&
          !Object.hasOwn(workspace.files, ensuredCssModule.stylesheetPath)
        ) {
          stageRecoveredWrite(turn, ensuredCssModule.stylesheetPath, ensuredCssModule.stylesheet);
        }
        for (const stylesheet of incompleteCssModuleImports(
          action.path || '',
          action.content || '',
          workspace.files,
        )) {
          const merged = appendMissingCssModuleRules(
            workspace.files[stylesheet] || '',
            action.content || '',
            resolvedStyleProfile,
            stylesheet,
          );
          if (merged) stageRecoveredWrite(turn, stylesheet, merged);
        }
        if (resolvedStyleProfile) {
          const rootTokens = ensureProjectRootTokens(workspace.files, resolvedStyleProfile);
          if (rootTokens && rootTokens.path !== action.path) {
            stageRecoveredWrite(turn, rootTokens.path, rootTokens.content);
          }
          const trace = projectStyleGenerationTrace(
            action.path || '',
            action.content || '',
            resolvedStyleProfile,
          );
          if (trace) context.record('style_generation', trace);
        }
        if (
          deferredSourceWrite?.stylesheets.every((path) => Object.hasOwn(workspace.files, path))
        ) {
          const source = deferredSourceWrite;
          stageRecoveredWrite(turn, source.path, source.content);
          deferredSourceWrite = null;
          const recoveryMessage = stageDeferredRecovery(source, turn, action);
          if (recoveryMessage) {
            result = recoveryMessage;
            messages.push({
              role: 'user',
              content: observation('css_recovery', false, result),
            });
            continue;
          }
          forcedWriteRecoveryPending = false;
          forcedRecoveryTargetPath = null;
          result = `Staged ${action.path} and the queued source file ${source.path}.`;
        } else {
          result = `Staged ${action.path} (${(action.content || '').length} characters).`;
        }
        onEvent({ type: 'tool', turn, action, agentRole });
      }
      if (action.action === 'replace_file_content') {
        const { path, content: newContent } = applyReplaceFileContent({
          action,
          files: workspace.files,
          request,
          lightweightModel: enforceFulfillment,
          taskContract,
        });
        workspace.write(path, newContent);
        previewInspectState.inspectedPreview = false;
        previewInspectState.previewInspectionAccepted = false;
        previewInspectState.lastPreviewResult = '';
        finishAfterAutomaticValidation = false;
        automaticValidationResult = '';
        validationState.wroteSinceVerification = true;
        nonProductiveActionsWithoutWrite = 0;
        unchangedReadSkips = 0;
        clearFailedWriteAttempts();
        onEvent({ type: 'tool', turn, action, agentRole });
        result = `Replaced target content in ${path}.`;
      }
      if (action.action === 'delete_file') {
        const path = action.path || '';
        assertTaskPathAllowed(taskContract, path);
        assertDeletableFile(path, workspace.files);
        workspace.delete(path);
        previewInspectState.inspectedPreview = false;
        previewInspectState.previewInspectionAccepted = false;
        previewInspectState.lastPreviewResult = '';
        finishAfterAutomaticValidation = false;
        automaticValidationResult = '';
        validationState.wroteSinceVerification = true;
        nonProductiveActionsWithoutWrite = 0;
        unchangedReadSkips = 0;
        onEvent({ type: 'tool', turn, action, agentRole });
        result = `Staged deletion of ${action.path}.`;
      }
      if (action.action === 'validate') {
        result = await runValidation(turn, 'model');
        if (isFailedValidationResult(result)) {
          failedWritePath =
            forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile) || '';
          failedWriteContent = failedWritePath ? workspace.files[failedWritePath] || '' : '';
          failedWriteDiagnostic = result;
          forcedWriteRecoveryPending = Boolean(failedWritePath);
          forcedRecoveryTargetPath = failedWritePath || forcedRecoveryTargetPath;
        }
        if (
          workspace.changes().length > 0 &&
          !validationState.lastValidationFailed &&
          !isFailedValidationResult(result)
        ) {
          result = `${result}\nValidation passed for the staged changes. Your next action must be finish with a brief summary. Do not validate again.`;
        }
      }
      if (action.action === 'list_project_checks') {
        onEvent({ type: 'tool', turn, action, agentRole });
        result = listProjectChecks(workspace.files).join('\n') || 'No eligible project checks.';
      }
      if (action.action === 'run_project_check') {
        onEvent({ type: 'tool', turn, action, agentRole });
        const checkResult = await runProjectCheck({
          check: action.check || '',
          files: workspace.files,
          run: executeProjectCheck,
        });
        result = formatVerificationResult(checkResult);
        context.record('project-check', checkResult);
      }
      if (action.action === 'inspect_preview') {
        result = await inspectPreviewForLoop(turn);
      }
      if (action.action === 'inspect_console_logs') {
        onEvent({ type: 'tool', turn, action, agentRole });
        result = inspectConsoleLogs(action, workspace.files);
      }
      if (action.action === 'get_file_symbols') {
        onEvent({ type: 'tool', turn, action, agentRole });
        result = inspectFileSymbols(action, workspace.files);
      }
      if (action.action === 'manage_packages') {
        onEvent({ type: 'tool', turn, action, agentRole });
        const packageResult = manageWorkspacePackages(action, workspace.files);
        if (packageResult.updatedPackageJson) {
          workspace.write('package.json', packageResult.updatedPackageJson);
        }
        result = packageResult.result;
      }
      if (action.action === 'finish') {
        onEvent({ type: 'tool', turn, action, agentRole });
        if (CHANGE_REQUEST_PATTERN.test(request) && workspace.changes().length === 0) {
          const target = forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
          forcedWriteRecoveryPending = true;
          forcedWriteRecoveryViolations = 0;
          const message = target
            ? `No file changes are staged for this edit request. Return exactly one write_file action for ${target} with the complete implementation before finishing.`
            : 'No file changes are staged for this edit request. Return exactly one write_file action with the complete implementation before finishing.';
          messages.push({ role: 'user', content: observation('finish', false, message) });
          context.record('finish_recovery', message);
          continue;
        }
        if (enforceFulfillment && CHANGE_REQUEST_PATTERN.test(request)) {
          const fulfillmentError = workspaceFulfillsInteractiveRequest(workspace.files, request);
          if (fulfillmentError) {
            const target =
              recoveryWritePath(workspace.files, activeFile) ||
              [...APP_ENTRY_PATHS].find((path) => Object.hasOwn(workspace.files, path)) ||
              'src/App.jsx';
            forcedWriteRecoveryPending = true;
            forcedRecoveryTargetPath = target;
            forcedWriteRecoveryViolations = 0;
            const message = `${fulfillmentError} Do not finish yet. Rewrite ${target} with a complete interactive implementation.`;
            messages.push({ role: 'user', content: observation('finish', false, message) });
            context.record('finish_fulfillment', message);
            onEvent({
              type: 'observation',
              turn,
              action,
              error: true,
              message,
              agentRole,
            });
            continue;
          }
        }
        if (hostAssistedSession) {
          const styleRepair = repairProjectStyleRelationships({
            files: workspace.files,
            targetPath: lightweightTargetPath,
            requireCoLocated: visualMode,
            repair: () => applyCssModuleRecovery(turn),
          });
          if (styleRepair) {
            if (styleRepair.remaining.length) {
              const message = `CSS Module contract is incomplete: ${styleRepair.remaining.join(' ')}`;
              messages.push({ role: 'user', content: observation('finish', false, message) });
              context.record('style_contract', message);
              continue;
            }
            context.record('style_recovery', `Recovered: ${styleRepair.recovered.join(', ')}`);
          }
        }
        if (validationState.lastValidationFailed) {
          const target: string =
            forcedRecoveryTargetPath ||
            recoveryWritePath(workspace.files, activeFile) ||
            'src/App.jsx';
          forcedWriteRecoveryPending = true;
          forcedRecoveryTargetPath = target;
          const message = `Validation failed for the staged changes. Do not finish yet. Return a corrected write_file for ${target} with complete working source code that builds successfully.`;
          messages.push({ role: 'user', content: observation('finish', false, message) });
          context.record('finish_failed_validation', message);
          onEvent({
            type: 'observation',
            turn,
            action,
            error: true,
            message,
            agentRole,
          });
          continue;
        }
        if (
          previewInspectionRequired &&
          (!previewInspectState.inspectedPreview || !previewInspectState.previewInspectionAccepted)
        ) {
          if (!previewInspectState.inspectedPreview && inspectPreview) {
            const previewResult = await inspectPreviewForLoop(turn);
            onEvent({
              type: 'observation',
              turn,
              action: { action: 'inspect_preview' },
              error: !previewInspectState.previewInspectionAccepted,
              message: previewResult,
              agentRole,
            });
            if (!(hostAssistedSession && previewInspectState.previewInspectionAccepted)) {
              messages.push({
                role: 'user',
                content: observation(
                  'inspect_preview',
                  previewInspectState.previewInspectionAccepted,
                  previewInspectState.previewInspectionAccepted
                    ? `${previewResult}\nReview this preview evidence before choosing the next action.`
                    : `${previewResult}\nThe preview is not ready for completion. Fix the rendered app or inspect it again before finishing.`,
                ),
              });
              continue;
            }
          } else {
            messages.push({
              role: 'user',
              content: observation(
                'finish',
                false,
                previewInspectState.previewInspectionAccepted
                  ? 'Visual UI review requires action "inspect_preview" before finishing. Use its structured evidence to assess landmarks, named controls, runtime errors, and the visual brief.'
                  : 'The previous preview inspection was insufficient. Do not finish. Wait for rendered DOM evidence and a captured screenshot, then inspect_preview again. If the preview remains empty or unstyled, write the necessary JSX/CSS fixes first.',
              ),
            });
            continue;
          }
        }
        if (validationState.wroteSinceVerification && validate) {
          if (hostAssistedSession) {
            // Host assistance: omit validate between write and finish for small models.
            const validationResult = await runValidation(turn);
            if (isFailedValidationResult(validationResult)) {
              const target: string =
                forcedRecoveryTargetPath ||
                recoveryWritePath(workspace.files, activeFile) ||
                'src/App.jsx';
              forcedWriteRecoveryPending = true;
              forcedRecoveryTargetPath = target;
              const message = `${validationResult} Do not finish yet. Rewrite ${target} with a complete working implementation.`;
              messages.push({ role: 'user', content: observation('finish', false, message) });
              context.record('finish_failed_validation', message);
              onEvent({
                type: 'observation',
                turn,
                action,
                error: true,
                message,
                agentRole,
              });
              continue;
            }
          } else {
            messages.push({
              role: 'user',
              content: observation(
                'finish',
                false,
                'Validate the staged edits by running action "validate" before finishing.',
              ),
            });
            continue;
          }
        }
        const missingStylesheets = [
          ...new Set(
            Object.entries(workspace.files).flatMap(([path, content]) =>
              /\.(?:jsx|tsx)$/i.test(path)
                ? missingCssModuleImports(path, content, workspace.files)
                : [],
            ),
          ),
        ];
        if (missingStylesheets.length) {
          forcedWriteRecoveryPending = true;
          forcedRecoveryTargetPath = missingStylesheets[0];
          forcedWriteRecoveryViolations = 0;
          messages.push({
            role: 'user',
            content: observation(
              'finish',
              false,
              `Create the missing CSS Module files before finishing: ${missingStylesheets.join(', ')}. Your next action must be write_file for ${missingStylesheets[0]}; do not validate or finish again until it exists.`,
            ),
          });
          context.record('finish_recovery', missingStylesheets.join(', '));
          onEvent({
            type: 'observation',
            turn,
            action,
            error: true,
            message: `Missing CSS Module files: ${missingStylesheets.join(', ')}. Forced stylesheet recovery is active.`,
            agentRole,
          });
          continue;
        }
        const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
        const changes = workspace.changes();
        const summary = normalizeFinishSummary({
          summary: action.summary,
          request,
          changeCount: changes.length,
          wiredEntry,
          validationStatus: validationState.lastValidationStatus,
        });
        onEvent({ type: 'finished', turn, changes, message: summary, agentRole });
        return {
          changes,
          files: workspace.files,
          summary,
          events: turn,
          workspace,
        };
      }
      messages.push({ role: 'user', content: observation(action.action, true, result) });
      context.record(action.action, result);
      onEvent({
        type: 'observation',
        turn,
        action,
        message: formatReasoningResult(action, result),
        agentRole,
      });
      if (action.action === 'write_file' && hostAssistedWrite) {
        const autoFinishResult = await finishContextReadyWrite(turn);
        if (autoFinishResult) return autoFinishResult;
      }
      lastSuccessfulFingerprint = fingerprint;
    } catch (error) {
      if (error instanceof AgentExecutionError) throw error;
      const err = error as Error;
      const stylesheetPath = action.path || '';
      const missingCssModules =
        action.action === 'write_file'
          ? missingCssModuleImports(action.path || '', action.content || '', workspace.files)
          : [];
      if (missingCssModules.length) {
        const contentTypeError = validateFileContentType(action.path || '', action.content || '');
        const syntaxError = validateContentSyntax(action.path || '', action.content || '');
        if (!contentTypeError && !syntaxError) {
          deferredSourceWrite = {
            path: action.path || '',
            content: action.content || '',
            stylesheets: missingCssModules,
          };
          forcedRecoveryTargetPath = missingCssModules[0];
          unchangedReadSkips = 0;
          const result = `Queued ${action.path}. Your next action must write ${missingCssModules[0]} with the complete CSS Module needed by that component. Do not list, search, or read files again.`;
          messages.push({ role: 'user', content: observation(action.action, false, result) });
          context.record(action.action, result);
          onEvent({ type: 'observation', turn, action, error: true, message: result, agentRole });
          continue;
        }
      }
      if (action.action === 'write_file') {
        const targetPath = action.path || '';
        failedWritePath = targetPath || failedWritePath;
        const hasStagedTarget = workspace.changes().some((change) => change.path === targetPath);
        // Keep the latest rejected candidate in the next repair prompt. Preserving the first
        // failed source made repeated repairs solve an obsolete version of the file and could
        // trap small models in the same validation loop.
        failedWriteContent = hasStagedTarget
          ? ''
          : action.content?.trim()
            ? action.content
            : failedWriteContent;
        failedWriteDiagnostic = err.message;
        forcedWriteRecoveryPending = true;
        forcedRecoveryTargetPath = action.path || forcedRecoveryTargetPath;
      }
      if (
        action.action === 'write_file' &&
        /\.module\.css$/i.test(stylesheetPath) &&
        /Unclosed '\{'|Unmatched '\}'/.test(err.message)
      ) {
        const attempts = (failedStylesheetWrites.get(stylesheetPath) || 0) + 1;
        failedStylesheetWrites.set(stylesheetPath, attempts);
        if (attempts >= 2) {
          const fallback = resolvedStyleProfile
            ? cssModuleRecovery(
                deferredSourceWrite?.content || '',
                resolvedStyleProfile,
                stylesheetPath,
              )
            : '.component {\n  display: block;\n}\n';
          workspace.write(stylesheetPath, fallback);
          validationState.wroteSinceVerification = true;
          failedWritePath = '';
          failedWriteContent = '';
          failedWriteDiagnostic = '';
          forcedWriteRecoveryPending = false;
          forcedRecoveryTargetPath = null;
          forcedWriteRecoveryViolations = 0;
          const message = `The local model repeatedly produced malformed CSS for ${stylesheetPath}. A safe minimal stylesheet was staged so implementation can continue.`;
          messages.push({ role: 'user', content: observation(action.action, true, message) });
          context.record('write_file', message);
          onEvent({ type: 'observation', turn, action, message, agentRole });
          continue;
        }
      }
      if (
        action.action === 'write_file' &&
        /not valid source code|only a placeholder|too short to fulfill|starter template|does not look like a working implementation/i.test(
          err.message,
        )
      ) {
        const target =
          action.path || recoveryWritePath(workspace.files, activeFile) || 'src/App.jsx';
        forcedWriteRecoveryPending = true;
        forcedRecoveryTargetPath = target;
        failedWritePath = target;
        recordFailedWriteAttempt(target);
        const message = lightweightModel
          ? `${err.message} Reply with ONLY a labelled code fence containing complete working source for ${target}, including state and event handlers when the request is interactive.`
          : `${err.message} Return a complete working implementation for ${target} as source code, not a sentence describing the request.`;
        messages.push({ role: 'user', content: observation(action.action, false, message) });
        context.record('write_file', message);
        onEvent({ type: 'observation', turn, action, error: true, message, agentRole });
        continue;
      }
      if (
        action.action === 'write_file' &&
        /\.(?:jsx|tsx|js|ts)$/i.test(action.path || '') &&
        /(?:bracket|string literal|Unclosed|Unterminated|Expected|Invalid|Unexpected|Parse error|Syntax error|ReactDOM bootstrap|CSS-style object|nested code fence)/i.test(
          err.message,
        )
      ) {
        malformedSourceAttempts += 1;
        const target =
          action.path || recoveryWritePath(workspace.files, activeFile) || 'src/App.jsx';
        if (lightweightModel) {
          forcedWriteRecoveryPending = true;
          forcedRecoveryTargetPath = target;
          failedWritePath = target;
        }
        if (malformedSourceAttempts >= malformedSourceAttemptLimit) {
          throw new AgentExecutionError(
            `The local model repeatedly produced malformed source for ${target} (${malformedSourceAttempts} attempts). Staged changes were preserved for review; retry with a stronger model or a narrower request.`,
            workspace.changes(),
          );
        }
        const targetedRecovery =
          writeRecovery(target, err.message, workspace.files) ||
          writeRecovery(target, 'Unmatched bracket', workspace.files);
        const message = lightweightModel
          ? `${err.message}${targetedRecovery} Reply with ONLY a labelled code fence containing complete working source for ${target}. Check every bracket, quote, and JSX tag before responding. Do not return JSON.`
          : `${err.message}${targetedRecovery || ` Return complete working source for ${target} with balanced brackets, quotes, and JSX tags. Do not return prose.`}`;
        messages.push({ content: observation(action.action, false, message), role: 'user' });
        context.record('malformed_source_recovery', message);
        onEvent({ type: 'observation', turn, action, error: true, message, agentRole });
        continue;
      }
      let recovery = '';
      if (action.action === 'read_file' && /^File not found: /.test(err.message)) {
        recovery =
          ' The requested file is absent. Do not call read_file for this path again. If this is a new component or stylesheet you need, create it with write_file; otherwise use one of the paths returned by list_files.';
      } else if (action.action === 'write_file') {
        recovery = /Missing CSS Module import/.test(err.message)
          ? ` The source file was not staged. Create the missing co-located stylesheet now: ${err.message.replace(/^.*?: /, '').replace(/\.$/, '')}. Then retry the source file with its CSS Module import.`
          : writeRecovery(action.path || '', err.message, workspace.files);
      } else if (action.action === 'delete_file' && /Cannot delete CSS Module/.test(err.message)) {
        recovery =
          ' The stylesheet was not deleted. Update or remove its importing component files first, then retry the deletion.';
      }
      if (action.action === 'write_file' && recovery) {
        failedWritePath = action.path || '';
      }
      const diagnostic = `${err.message}${recovery}`;
      messages.push({ role: 'user', content: observation(action.action, false, diagnostic) });
      onEvent({
        type: 'observation',
        turn,
        action,
        error: true,
        message: diagnostic,
        agentRole,
      });
    }
  }
  // Validate a useful draft at the safety limit instead of hiding it behind an error.
  if (workspace.changes().length > 0) {
    try {
      applyCssModuleRecovery(maxTurns);
      const wiredEntry = wireNewComponentIntoScratchEntry(workspace);
      const result = await runValidation(maxTurns);
      if (isFailedValidationResult(result)) {
        throw new AgentExecutionError(
          `Final validation failed at the ${maxTurns}-step safety limit: ${result}`,
          workspace.changes(),
        );
      }
      const needsEntryWiring = newlyCreatedComponentsNeedEntryWiring(workspace);
      const detail = wiredEntry
        ? ` Host recovery wired ${wiredEntry} before validation.`
        : needsEntryWiring
          ? ' The partial draft created new components without wiring them into the application entry point.'
          : '';
      const summary = `The agent reached its ${maxTurns}-step safety limit. Its partial draft passed deterministic validation but remains incomplete and is preserved for review; it was not reported as a completed request.${detail}`;
      onEvent({
        type: 'finished',
        turn: maxTurns,
        changes: workspace.changes(),
        message: summary,
        agentRole,
      });
      context.record('validation', result);
      return {
        changes: workspace.changes(),
        files: workspace.files,
        summary,
        events: maxTurns,
        workspace,
      };
    } catch (error) {
      const err = error as Error;
      throw new AgentExecutionError(
        `Agent reached its ${maxTurns}-step safety limit and final validation failed: ${err.message}`,
        workspace.changes(),
      );
    }
  }
  throw new AgentExecutionError(`Agent reached its ${maxTurns}-step safety limit.`, []);
}
