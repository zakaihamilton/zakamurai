import type { RunAgentOptions, RunAgentResult, WebLLMMessage } from '@/components/AI/types';
import {
  validateAIChanges,
  validateComponentStyling,
  validateContentSyntax,
  validateCssContentSafety,
  validateCssModuleUsage,
  validateFileContentType,
  validateGeneratedPlaceholder,
  validateRequestFulfillment,
  workspaceFulfillsInteractiveRequest,
} from '../ChangeValidator';
import { AgentExecutionError, AgentRecoveryValidationError } from './ActionLoopErrors';
import {
  AGENT_CONTEXT_WINDOW_SIZE,
  AGENT_GENERATION_TOKENS,
  AGENT_RECOVERY_TOKENS,
  APP_ENTRY_PATHS,
  CHANGE_REQUEST_PATTERN,
  CONTEXT_READY_AGENT_INSTRUCTIONS,
  LIGHTWEIGHT_AGENT_GENERATION_TOKENS,
  LIGHTWEIGHT_AGENT_RECOVERY_TOKENS,
  LIGHTWEIGHT_AGENT_SYSTEM_PROMPT,
  LIGHTWEIGHT_CONTEXT_READY_INSTRUCTIONS,
  buildContextReadyUserRequest,
  buildDirectChangesRecoveryMessages,
  buildForcedWriteRecoveryMessages,
  buildUserRequest,
  getModelDownloadProgress,
  isIncompleteWriteError,
  isLightweightAgentModel,
  loadAskWebLLM,
  newlyCreatedComponentsNeedEntryWiring,
  normalizeFinishSummary,
  recoveryWritePath,
  wireNewComponentIntoScratchEntry,
  writeRecovery,
} from './ActionLoopRecovery';
import {
  NON_PRODUCTIVE_ACTIONS,
  READ_ONLY_ACTIONS,
  appendMissingCssModuleRules,
  applySearchReplaceBlock,
  cssModuleImporters,
  cssModuleRecovery,
  ensureCoLocatedCssModule,
  formatReasoningResult,
  incompleteCssModuleImports,
  isFailedValidationResult,
  missingCssModuleImports,
  missingCssModuleRules,
  normalizeSideEffectCssSource,
  observation,
  recoverWorkspaceCssModules,
  repairCssModuleStylesheet,
  rewriteInlineStylesToCssModule,
} from './ActionLoopUtils';
import { type ActionLoopValidationState, createValidationRunner } from './ActionLoopValidation';
import { type ConsoleLogEntry, filterConsoleLogs, formatConsoleLogs } from './ConsoleLogInspector';
import { AgentContextManager, formatVerificationResult } from './ContextManager';
import { parseModelResult } from './ManagerProtocol';
import { type PackageAction, handlePackageOperation } from './PackageManager';
import { listProjectChecks, runProjectCheck } from './ProjectChecks';
import { AGENT_SYSTEM_PROMPT, ALL_AGENT_ACTIONS, parseAgentAction } from './Protocol';
import { extractFileSymbols, formatSymbolOutline } from './SymbolInspector';
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
  maxTurns = 30,
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
}: RunAgentOptions): Promise<RunAgentResult> {
  const askWebLLM = modelClient ? null : await loadAskWebLLM();
  const workspace = existingWorkspace || new AgentWorkspace(files, workspaceIndex);
  const context = new AgentContextManager({ request, priorContext });
  const lightweightModel = isLightweightAgentModel(model);
  const baseSystemPrompt =
    lightweightModel && !agentRole ? LIGHTWEIGHT_AGENT_SYSTEM_PROMPT : systemPrompt;
  const contextReadyInstructions = lightweightModel
    ? LIGHTWEIGHT_CONTEXT_READY_INSTRUCTIONS
    : CONTEXT_READY_AGENT_INSTRUCTIONS;
  const agentSystemPrompt =
    priorContext && !agentRole
      ? `${contextReadyInstructions}\n\n${baseSystemPrompt}`
      : baseSystemPrompt;
  const lightweightTargetPath = recoveryWritePath(workspace.files, activeFile) || 'src/App.jsx';
  const contextReady = Boolean(priorContext) && !agentRole;
  const messages: WebLLMMessage[] = [
    { role: 'system', content: agentSystemPrompt },
    {
      role: 'user',
      content: contextReady
        ? buildContextReadyUserRequest({
            request,
            targetPath: lightweightTargetPath,
            files: workspace.files,
            priorContext,
            lightweight: lightweightModel,
          })
        : buildUserRequest({
            request,
            scope,
            activeFile,
            selectedLines,
            priorContext: context.toString(),
          }),
    },
  ];
  let protocolFailures = 0;
  let lastFingerprint = '';
  let repeatedActions = 0;
  let lastSuccessfulFingerprint = '';
  const validationState: ActionLoopValidationState = {
    wroteSinceVerification: false,
    lastValidationFailed: false,
    repairAttempts: 0,
  };
  let inspectedPreview = false;
  let recoveredNoOpWrite = '';
  let failedWritePath = '';
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
  // Manager already collected workspace context; one redundant inspection is enough to force a write.
  const nonProductiveActionLimit = contextReady ? 1 : lightweightModel ? 2 : 4;
  // Lightweight models stay on fence-only recovery longer instead of escalating to kind=changes.
  const forcedRecoveryViolationLimit = lightweightModel ? 4 : 2;
  const incompleteWriteRetryLimit = lightweightModel ? 3 : 2;
  // Incomplete metadata ↔ prose oscillation must not burn the full step budget.
  const failedWriteAttemptLimit = lightweightModel ? 5 : 6;
  const malformedSourceAttemptLimit = lightweightModel ? 3 : 4;
  const validationRepairLimit = lightweightModel ? 2 : 3;

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

  const applyCssModuleRecovery = (turn: number): string[] => {
    const recovered = recoverWorkspaceCssModules(workspace.files);
    for (const { path, content } of recovered) stageRecoveredWrite(turn, path, content);
    return recovered.map((entry) => entry.path);
  };

  const autoFinishSummary = (
    reason: 'validate' | 'identical-write' | 'unchanged-reads' | 'safety-limit',
    wiredEntry: string | null,
  ): string => {
    const base = CHANGE_REQUEST_PATTERN.test(request)
      ? reason === 'safety-limit'
        ? 'Completed the requested changes after the agent reached its step safety limit and validated the build.'
        : 'Completed the requested changes and validated the build.'
      : reason === 'validate'
        ? 'Validated the staged changes after the local model repeated validation.'
        : reason === 'identical-write'
          ? 'Validated the staged changes after the local model repeated an identical write action.'
          : reason === 'unchanged-reads'
            ? 'Validated the staged changes after the local model repeatedly read unchanged files.'
            : 'Validated the staged changes after the agent reached its step safety limit.';
    return wiredEntry
      ? `${base} wired ${wiredEntry} to the new component so it renders in the app.`
      : base;
  };

  const runValidation = createValidationRunner({
    workspace,
    validate,
    onEvent,
    agentRole,
    context,
    state: validationState,
    validationRepairLimit,
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
          : 'Reviewing the latest tool result and choosing the next action…',
    });
    onEvent({
      type: 'thinking',
      turn,
      agentRole,
      message: 'Requesting the next action from the local model...',
    });
    let receivedModelOutput = false;
    let streamedCharacterCount = 0;
    const responseStartedAt = Date.now();
    const heartbeat = setInterval(() => {
      const elapsedSeconds = Math.max(1, Math.floor((Date.now() - responseStartedAt) / 1000));
      const downloadProgress = getModelDownloadProgress(model);
      const progress = downloadProgress
        ? downloadProgress
        : receivedModelOutput
          ? `${streamedCharacterCount.toLocaleString()} character(s) received; waiting for a complete JSON action before validation`
          : 'the model has not started streaming yet; keeping the workspace context ready';
      onEvent({
        type: 'thinking',
        turn,
        agentRole,
        replaceProgress: true,
        message: `Local model is still working (${elapsedSeconds}s elapsed; ${progress})…`,
      });
    }, 3_000);
    let reply: string;
    const recoveryTarget =
      forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
    const modelMessages = directChangesRecoveryPending
      ? buildDirectChangesRecoveryMessages({
          request,
          targetPath: recoveryTarget,
          files: workspace.files,
          lightweight: lightweightModel,
        })
      : forcedWriteRecoveryPending
        ? buildForcedWriteRecoveryMessages({
            request,
            targetPath: recoveryTarget,
            files: workspace.files,
            lightweight: lightweightModel,
            incompleteWrite: incompleteWriteRetries > 0,
          })
        : messages;
    const safeModelMessages = modelMessages.filter(Boolean);
    try {
      if (modelSession) {
        reply = await modelSession.generate({
          model,
          messages: safeModelMessages,
          signal,
          task: 'generate-changes',
          onMetrics,
          temperature: lightweightModel ? 0.2 : visualMode ? 0.12 : 0.15,
          top_p: lightweightModel ? 0.85 : 0.8,
          max_tokens: lightweightModel
            ? visualMode || failedWritePath || forcedWriteRecoveryPending
              ? LIGHTWEIGHT_AGENT_RECOVERY_TOKENS
              : LIGHTWEIGHT_AGENT_GENERATION_TOKENS
            : visualMode || failedWritePath || forcedWriteRecoveryPending
              ? AGENT_RECOVERY_TOKENS
              : AGENT_GENERATION_TOKENS,
          contextWindowSize: AGENT_CONTEXT_WINDOW_SIZE,
          sessionId,
        });
      } else if (modelClient) {
        reply = await modelClient({
          model,
          messages: modelMessages,
          signal,
          task: 'generate-changes',
          onMetrics,
          temperature: lightweightModel ? 0.2 : visualMode ? 0.12 : 0.15,
          top_p: lightweightModel ? 0.85 : 0.8,
          max_tokens: lightweightModel
            ? visualMode || failedWritePath || forcedWriteRecoveryPending
              ? LIGHTWEIGHT_AGENT_RECOVERY_TOKENS
              : LIGHTWEIGHT_AGENT_GENERATION_TOKENS
            : visualMode || failedWritePath || forcedWriteRecoveryPending
              ? AGENT_RECOVERY_TOKENS
              : AGENT_GENERATION_TOKENS,
          contextWindowSize: AGENT_CONTEXT_WINDOW_SIZE,
          sessionId,
        });
      } else {
        if (!askWebLLM) throw new Error('WebLLM is unavailable.');
        reply = await askWebLLM(
          '',
          '',
          (output) => {
            streamedCharacterCount = output.length;
            receivedModelOutput = true;
            onEvent({
              type: 'thinking',
              turn,
              agentRole,
              replaceProgress: true,
              message: `Local model is responding — streaming its next action (${streamedCharacterCount.toLocaleString()} character(s) received). Waiting for one complete JSON action before validation…`,
            });
          },
          {
            model,
            messages: safeModelMessages,
            signal,
            requestKind: 'agent',
            onMetrics,
            onRecovery: (recovery) => {
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
            temperature: lightweightModel ? 0.2 : visualMode ? 0.12 : 0.15,
            top_p: lightweightModel ? 0.85 : 0.8,
            // Give a repair turn enough room to return one complete source file instead of
            // repeating a truncated payload from the preceding attempt.
            max_tokens: lightweightModel
              ? visualMode || failedWritePath || forcedWriteRecoveryPending
                ? LIGHTWEIGHT_AGENT_RECOVERY_TOKENS
                : LIGHTWEIGHT_AGENT_GENERATION_TOKENS
              : visualMode || failedWritePath || forcedWriteRecoveryPending
                ? AGENT_RECOVERY_TOKENS
                : AGENT_GENERATION_TOKENS,
            contextWindowSize: AGENT_CONTEXT_WINDOW_SIZE,
            sessionId,
          },
        );
      }
    } finally {
      clearInterval(heartbeat);
    }
    onEvent({
      type: 'model_io',
      turn,
      agentRole,
      input: safeModelMessages
        .map((message) => `[${message.role}]\n${message.content}`)
        .join('\n\n'),
      output: reply,
    });
    messages.push({ role: 'assistant', content: reply });
    let action: ReturnType<typeof parseAgentAction> | undefined;
    try {
      action = parseAgentAction(reply, {
        allowedActions,
        // Source-only / fence-only replies are common for small local models; bind them to the
        // known entry path whenever we can identify one.
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
          if (requirePreviewInspection && !inspectedPreview) {
            onEvent({ type: 'tool', turn, action: { action: 'inspect_preview' }, agentRole });
            const preview = inspectPreview
              ? await inspectPreview(workspace.files)
              : { status: 'unavailable', diagnostics: 'Preview inspection is unavailable.' };
            inspectedPreview = true;
            previewSummary = `\n\nPreview inspection:\n${JSON.stringify(preview)}`;
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
          // Give the first metadata-only reply a free retry; later incompletes still
          // count so oscillation cannot exhaust the step budget unnoticed.
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
          ? target
            ? `Recovery mode is active. Reply with ONLY a labelled code fence containing complete source for ${target}. Do not return JSON, list_files, validate, or prose.`
            : 'Recovery mode is active. Reply with ONLY a labelled code fence containing complete source. Do not return JSON, list_files, validate, or prose.'
          : target
            ? `Recovery mode is active. Return exactly one write_file action for ${target} with complete source content. Do not use list_files, validate, inspect_preview, or prose.`
            : 'Recovery mode is active. Return exactly one write_file action with complete source content. Do not use list_files, validate, inspect_preview, or prose.';
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
      if (protocolFailures >= 4)
        throw new Error(
          `Local model could not follow the agent protocol after recovery: ${err.message}`,
        );
      const incompleteWriteGuidance = isIncompleteWriteError(err.message)
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
        stageRecoveredWrite(turn, stylesheet, cssModuleRecovery(source.content));
      }
      stageRecoveredWrite(turn, source.path, source.content);
      validationState.wroteSinceVerification = true;
      deferredSourceWrite = null;
      forcedWriteRecoveryPending = false;
      forcedRecoveryTargetPath = null;
      const message = `The model did not provide the requested CSS Module, so staged ${source.path} with generated semantic CSS recovery for ${source.stylesheets.join(', ')}.`;
      messages.push({ role: 'user', content: observation('css_recovery', true, message) });
      context.record('css_recovery', message);
      onEvent({ type: 'observation', turn, action, message, agentRole });
      continue;
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
        const message = target
          ? `Recovery mode: the workspace has already been inspected. Do not list, search, or read files again. Your next response must be a write_file action for ${target} that fulfills the original request, with complete source content. Only call finish if no code change is needed.`
          : 'Recovery mode: the workspace has already been inspected. Do not list, search, or read files again. Your next response must be a write_file action that fulfills the original request, with complete source content. Only call finish if no code change is needed.';
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
        // Small local models often stop generating after their first repeated read.
        // Prompt for a productive write immediately, while the workspace context is fresh.
        if (unchangedReadSkips === 1 && workspace.changes().length === 0) {
          const target = forcedRecoveryTargetPath || recoveryWritePath(workspace.files, activeFile);
          forcedWriteRecoveryPending = true;
          messages.push({
            role: 'user',
            content: observation(
              'stuck_read_recovery',
              false,
              target
                ? `Recovery mode: the workspace has already been inspected. Do not list, search, or read files again. Your next response must be a write_file action for ${target} that fulfills the original request, with complete source content. Only call finish if no code change is needed.`
                : 'Recovery mode: the workspace has already been inspected. Do not list, search, or read files again. Your next response must be a write_file action that fulfills the original request, with complete source content. Only call finish if no code change is needed.',
            ),
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
      Object.hasOwn(workspace.files, writePath) &&
      workspace.files[writePath] === (action.content || '');
    // Finish on the second consecutive validate when staged work already exists —
    // small models often loop validate instead of emitting finish.
    if (action.action === 'validate' && workspace.changes().length > 0 && repeatedActions >= 1) {
      applyCssModuleRecovery(turn);
      const result = await runValidation(turn);
      if (isFailedValidationResult(result)) {
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
          const finishHint = validationFailed
            ? ' Validation failed for the staged changes. Do not finish. Return a corrected write_file action with complete working source.'
            : ' Validation passed for the staged changes. Your next action must be finish with a brief summary. Do not rewrite or validate again.';
          messages.push({
            role: 'user',
            content: observation(
              action.action,
              !validationFailed,
              `${message}\n${result}${finishHint}`,
            ),
          });
          context.record('write_file', message);
          onEvent({
            type: 'observation',
            turn,
            action,
            error: validationFailed,
            message: formatReasoningResult(action, `${message} ${result}`),
            agentRole,
          });
          if (validationFailed) {
            recoveredNoOpWrite = '';
            forcedWriteRecoveryPending = true;
            forcedRecoveryTargetPath = action.path || forcedRecoveryTargetPath;
            forcedWriteRecoveryViolations = 0;
            failedWritePath = action.path || failedWritePath;
            continue;
          }
          recoveredNoOpWrite = fingerprint;
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
        const normalizedSideEffectCss = /\.(jsx|tsx)$/i.test(action.path || '')
          ? normalizeSideEffectCssSource(action.path || '', action.content || '')
          : null;
        if (normalizedSideEffectCss) {
          action = { ...action, content: normalizedSideEffectCss.content };
        }
        const rewrittenInlineStyles = /\.(jsx|tsx)$/i.test(action.path || '')
          ? rewriteInlineStylesToCssModule(action.path || '', action.content || '')
          : null;
        if (rewrittenInlineStyles) {
          action = { ...action, content: rewrittenInlineStyles.content };
        }
        const ensuredCssModule =
          lightweightModel && !rewrittenInlineStyles && /\.(jsx|tsx)$/i.test(action.path || '')
            ? ensureCoLocatedCssModule(action.path || '', action.content || '')
            : null;
        if (ensuredCssModule) {
          action = { ...action, content: ensuredCssModule.content };
        }
        const stylingError = validateComponentStyling(action.path || '', action.content || '');
        if (stylingError) throw new Error(stylingError);
        const contentTypeError = validateFileContentType(action.path || '', action.content || '');
        if (contentTypeError) throw new Error(contentTypeError);
        const placeholderError = validateGeneratedPlaceholder(
          action.path || '',
          action.content || '',
        );
        if (placeholderError) throw new Error(placeholderError);
        if (lightweightModel) {
          const fulfillmentError = validateRequestFulfillment(
            action.path || '',
            action.content || '',
            request,
          );
          if (fulfillmentError) throw new Error(fulfillmentError);
        }
        const cssModuleError = validateCssModuleUsage(action.path || '', action.content || '');
        if (cssModuleError) throw new Error(cssModuleError);
        const missingStylesheets = missingCssModuleImports(
          action.path || '',
          action.content || '',
          workspace.files,
        );
        if (
          missingStylesheets.length &&
          !normalizedSideEffectCss &&
          !rewrittenInlineStyles &&
          !ensuredCssModule
        ) {
          throw new Error(
            `Missing CSS Module import${missingStylesheets.length > 1 ? 's' : ''}: ${missingStylesheets.join(', ')}.`,
          );
        }
        const cssSafetyError = validateCssContentSafety(action.path || '', action.content || '');
        if (cssSafetyError) throw new Error(cssSafetyError);
        const syntaxError = validateContentSyntax(action.path || '', action.content || '');
        if (syntaxError) throw new Error(syntaxError);
        if (/\.module\.css$/i.test(action.path || '')) {
          action = {
            ...action,
            content: repairCssModuleStylesheet(
              action.path || '',
              action.content || '',
              workspace.files,
            ),
          };
        }
        const remainingMissingRules = missingCssModuleRules(
          action.path || '',
          action.content || '',
          workspace.files,
        );
        if (remainingMissingRules.length) {
          throw new Error(
            `CSS Module ${action.path} is missing rules required by its importing component: ${remainingMissingRules.join(', ')}.`,
          );
        }
        workspace.write(action.path || '', action.content || '');
        nonProductiveActionsWithoutWrite = 0;
        validationState.wroteSinceVerification = true;
        failedWritePath = '';
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
            stageRecoveredWrite(turn, stylesheet, cssModuleRecovery(action.content || ''));
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
          );
          if (merged) stageRecoveredWrite(turn, stylesheet, merged);
        }
        if (
          deferredSourceWrite?.stylesheets.every((path) => Object.hasOwn(workspace.files, path))
        ) {
          stageRecoveredWrite(turn, deferredSourceWrite.path, deferredSourceWrite.content);
          result = `Staged ${action.path} and the queued source file ${deferredSourceWrite.path}.`;
          deferredSourceWrite = null;
          forcedWriteRecoveryPending = false;
          forcedRecoveryTargetPath = null;
        } else {
          result = `Staged ${action.path} (${(action.content || '').length} characters).`;
        }
        onEvent({ type: 'tool', turn, action, agentRole });
      }
      if (action.action === 'replace_file_content') {
        const path = action.path || '';
        const existingContent = workspace.read(path);
        if (!existingContent && existingContent !== '') {
          throw new Error(`File not found: ${path}. Cannot perform replace_file_content.`);
        }
        let search = action.search || '';
        let replace = action.replace || '';
        if (!search && action.content) {
          const match = action.content.match(
            /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/,
          );
          if (match) {
            search = match[1];
            replace = match[2];
          }
        }

        if (!search) {
          throw new Error(
            'replace_file_content action requires search block or SEARCH/REPLACE pattern.',
          );
        }

        const newContent = applySearchReplaceBlock(existingContent, search, replace);
        workspace.write(path, newContent);
        validationState.wroteSinceVerification = true;
        nonProductiveActionsWithoutWrite = 0;
        unchangedReadSkips = 0;
        clearFailedWriteAttempts();
        onEvent({ type: 'tool', turn, action, agentRole });
        result = `Replaced target content in ${path}.`;
      }
      if (action.action === 'delete_file') {
        const path = action.path || '';
        const importers = cssModuleImporters(path, workspace.files);
        if (importers.length) {
          throw new Error(
            `Cannot delete CSS Module ${path} because it is imported by ${importers.join(', ')}. Update or delete the importing component files first.`,
          );
        }
        workspace.delete(path);
        validationState.wroteSinceVerification = true;
        nonProductiveActionsWithoutWrite = 0;
        unchangedReadSkips = 0;
        onEvent({ type: 'tool', turn, action, agentRole });
        result = `Staged deletion of ${action.path}.`;
      }
      if (action.action === 'validate') {
        result = await runValidation(turn, 'model');
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
        onEvent({ type: 'tool', turn, action, agentRole });
        const preview = inspectPreview
          ? await inspectPreview(workspace.files)
          : { status: 'unavailable', diagnostics: 'Preview inspection is unavailable.' };
        result = JSON.stringify(preview);
        inspectedPreview = true;
        context.record('preview', preview);
      }
      if (action.action === 'inspect_console_logs') {
        onEvent({ type: 'tool', turn, action, agentRole });
        const query = action.query;
        const level = action.level;
        const rawLogs = (workspace.files['.console.log'] || '').split('\n').filter(Boolean);
        const parsedLogs: ConsoleLogEntry[] = rawLogs.map((line) => {
          const isErr = line.includes('[ERROR]');
          const isWarn = line.includes('[WARN]');
          return {
            level: isErr ? 'error' : isWarn ? 'warn' : 'log',
            message: line,
          };
        });
        const filtered = filterConsoleLogs(parsedLogs, { query, level });
        result = formatConsoleLogs(filtered);
      }
      if (action.action === 'get_file_symbols') {
        onEvent({ type: 'tool', turn, action, agentRole });
        const path = action.path || '';
        const fileContent = workspace.read(path);
        if (!fileContent) {
          result = `File not found: ${path}`;
        } else {
          const outline = extractFileSymbols(fileContent, path);
          result = formatSymbolOutline(outline);
        }
      }
      if (action.action === 'manage_packages') {
        onEvent({ type: 'tool', turn, action, agentRole });
        const rawAction = action.query || 'list';
        const pkgAction: PackageAction =
          rawAction === 'add' || rawAction === 'remove' ? rawAction : 'list';
        const packageName = action.packageName;
        const version = action.version;
        const isDev = Boolean(action.isDev);

        const opResult = handlePackageOperation(workspace.files, {
          action: pkgAction,
          packageName,
          version,
          isDev,
        });

        if (opResult.updatedPackageJson) {
          workspace.write('package.json', opResult.updatedPackageJson);
        }

        result = JSON.stringify(opResult);
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
        if (lightweightModel && CHANGE_REQUEST_PATTERN.test(request)) {
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
        if (requirePreviewInspection && !inspectedPreview) {
          messages.push({
            role: 'user',
            content: observation(
              'finish',
              false,
              'Visual UI review requires action "inspect_preview" before finishing. Use its structured evidence to assess landmarks, named controls, runtime errors, and the visual brief.',
            ),
          });
          continue;
        }
        if (validationState.wroteSinceVerification && validate) {
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
        const missingStylesheets = Object.entries(workspace.files).flatMap(([path, content]) =>
          /\.(?:jsx|tsx)$/i.test(path)
            ? missingCssModuleImports(path, content, workspace.files)
            : [],
        );
        if (missingStylesheets.length) {
          messages.push({
            role: 'user',
            content: observation(
              'finish',
              false,
              `Create the missing CSS Module files before finishing: ${[...new Set(missingStylesheets)].join(', ')}.`,
            ),
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
      lastSuccessfulFingerprint = fingerprint;
      context.record(action.action, result);
      onEvent({
        type: 'observation',
        turn,
        action,
        message: formatReasoningResult(action, result),
        agentRole,
      });
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
      if (
        action.action === 'write_file' &&
        /\.module\.css$/i.test(stylesheetPath) &&
        /Unclosed '\{'|Unmatched '\}'/.test(err.message)
      ) {
        const attempts = (failedStylesheetWrites.get(stylesheetPath) || 0) + 1;
        failedStylesheetWrites.set(stylesheetPath, attempts);
        if (attempts >= 2) {
          const fallback = '.component {\n  display: block;\n}\n';
          workspace.write(stylesheetPath, fallback);
          validationState.wroteSinceVerification = true;
          failedWritePath = '';
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
        /(?:bracket|string literal|Unclosed|Unterminated|Expected|Invalid|Unexpected|Parse error|Syntax error)/i.test(
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
      const recovery =
        action.action === 'read_file' && /^File not found: /.test(err.message)
          ? ' The requested file is absent. Do not call read_file for this path again. If this is a new component or stylesheet you need, create it with write_file; otherwise use one of the paths returned by list_files.'
          : action.action === 'write_file'
            ? /Missing CSS Module import/.test(err.message)
              ? ` The source file was not staged. Create the missing co-located stylesheet now: ${err.message.replace(/^.*?: /, '').replace(/\.$/, '')}. Then retry the source file with its CSS Module import.`
              : writeRecovery(action.path || '', err.message, workspace.files)
            : action.action === 'delete_file' && /Cannot delete CSS Module/.test(err.message)
              ? ' The stylesheet was not deleted. Update or remove its importing component files first, then retry the deletion.'
              : '';
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
  // A local model can keep polishing a valid multi-file draft instead of emitting finish.
  // Do one last validation so useful, reviewable changes are returned rather than hidden behind
  // a safety-limit error. Failed validation still remains an error, because the draft needs repair.
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
      const summary = needsEntryWiring
        ? `Validated a partial draft after the agent reached its ${maxTurns}-step safety limit. It created new components without wiring them into the application entry point; review the draft before applying it.`
        : autoFinishSummary('safety-limit', wiredEntry);
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
