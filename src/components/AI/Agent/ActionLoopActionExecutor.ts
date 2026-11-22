import { validateContentSyntax, validateFileContentType } from '../ChangeValidator';
import { assertTaskPathAllowed } from '../ReliabilityContracts';
import { AgentExecutionError } from './ActionLoopErrors';
import { handleFinishAction } from './ActionLoopFinishGate';
import {
  inspectConsoleLogs,
  inspectFileSymbols,
  manageWorkspacePackages,
} from './ActionLoopInspect';
import { recoveryWritePath, writeRecovery } from './ActionLoopRecovery';
import {
  type ActionLoopAction,
  type ActionLoopState,
  type ActionLoopStepOutcome,
  clearFailedWriteAttempts,
  markWorkspaceMutated,
  recordFailedWriteAttempt,
  stageDeferredRecovery,
  stageRecoveredWrite,
} from './ActionLoopState';
import {
  appendMissingCssModuleRules,
  cssModuleRecovery,
  formatReasoningResult,
  incompleteCssModuleImports,
  isFailedValidationResult,
  missingCssModuleImports,
  observation,
} from './ActionLoopUtils';
import {
  applyReplaceFileContent,
  assertDeletableFile,
  prepareWriteFileAction,
} from './ActionLoopWrites';
import { formatVerificationResult } from './ContextManager';
import { listProjectChecks, runProjectCheck } from './ProjectChecks';
import { ensureProjectRootTokens, projectStyleGenerationTrace } from './ProjectStyleProfile';

const executeWriteFile = async (
  state: ActionLoopState,
  turn: number,
  initialAction: ActionLoopAction,
): Promise<
  | { kind: 'continue'; action: ActionLoopAction }
  | { kind: 'done'; result: string; action: ActionLoopAction }
> => {
  assertTaskPathAllowed(state.taskContract, initialAction.path || '');
  const prepared = prepareWriteFileAction({
    action: initialAction,
    files: state.workspace.files,
    request: state.request,
    styleProfile: state.resolvedStyleProfile,
    lightweightModel: state.enforceFulfillment,
  });
  const action = prepared.action;
  const { normalizedSideEffectCss, rewrittenInlineStyles, ensuredCssModule } = prepared;
  state.workspace.write(action.path || '', action.content || '');
  markWorkspaceMutated(state);
  state.failedWritePath = '';
  state.failedWriteContent = '';
  state.failedWriteDiagnostic = '';
  clearFailedWriteAttempts(state);
  state.declarationRepairAttempts = 0;
  state.malformedSourceAttempts = 0;
  state.forcedWriteRecoveryPending = false;
  state.forcedRecoveryTargetPath = null;
  state.forcedWriteRecoveryViolations = 0;
  state.failedStylesheetWrites.delete(action.path || '');
  if (normalizedSideEffectCss) {
    for (const stylesheet of normalizedSideEffectCss.stylesheets) {
      if (Object.hasOwn(state.workspace.files, stylesheet)) continue;
      stageRecoveredWrite(
        state,
        turn,
        stylesheet,
        cssModuleRecovery(action.content || '', state.resolvedStyleProfile, stylesheet),
      );
    }
  }
  if (rewrittenInlineStyles) {
    const existing = state.workspace.files[rewrittenInlineStyles.stylesheetPath] || '';
    stageRecoveredWrite(
      state,
      turn,
      rewrittenInlineStyles.stylesheetPath,
      existing
        ? `${existing.trimEnd()}\n\n${rewrittenInlineStyles.stylesheet}`
        : rewrittenInlineStyles.stylesheet,
    );
  } else if (
    ensuredCssModule &&
    !Object.hasOwn(state.workspace.files, ensuredCssModule.stylesheetPath)
  ) {
    stageRecoveredWrite(state, turn, ensuredCssModule.stylesheetPath, ensuredCssModule.stylesheet);
  }
  for (const stylesheet of incompleteCssModuleImports(
    action.path || '',
    action.content || '',
    state.workspace.files,
  )) {
    const merged = appendMissingCssModuleRules(
      state.workspace.files[stylesheet] || '',
      action.content || '',
      state.resolvedStyleProfile,
      stylesheet,
    );
    if (merged) stageRecoveredWrite(state, turn, stylesheet, merged);
  }
  if (state.resolvedStyleProfile) {
    const rootTokens = ensureProjectRootTokens(state.workspace.files, state.resolvedStyleProfile);
    if (rootTokens && rootTokens.path !== action.path) {
      stageRecoveredWrite(state, turn, rootTokens.path, rootTokens.content);
    }
    const trace = projectStyleGenerationTrace(
      action.path || '',
      action.content || '',
      state.resolvedStyleProfile,
    );
    if (trace) state.context.record('style_generation', trace);
  }
  let result: string;
  if (
    state.deferredSourceWrite?.stylesheets.every((path) =>
      Object.hasOwn(state.workspace.files, path),
    )
  ) {
    const source = state.deferredSourceWrite;
    stageRecoveredWrite(state, turn, source.path, source.content);
    state.deferredSourceWrite = null;
    const recoveryMessage = stageDeferredRecovery(state, source, turn, action);
    if (recoveryMessage) {
      state.messages.push({
        role: 'user',
        content: observation('css_recovery', false, recoveryMessage),
      });
      return { kind: 'continue', action };
    }
    state.forcedWriteRecoveryPending = false;
    state.forcedRecoveryTargetPath = null;
    result = `Staged ${action.path} and the queued source file ${source.path}.`;
  } else {
    result = `Staged ${action.path} (${(action.content || '').length} characters).`;
  }
  state.onEvent({ type: 'tool', turn, action, agentRole: state.agentRole });
  return { kind: 'done', result, action };
};

const handleActionExecutionError = (
  state: ActionLoopState,
  turn: number,
  action: ActionLoopAction,
  error: unknown,
): 'continue' => {
  if (error instanceof AgentExecutionError) throw error;
  const err = error as Error;
  const stylesheetPath = action.path || '';
  const missingCssModules =
    action.action === 'write_file'
      ? missingCssModuleImports(action.path || '', action.content || '', state.workspace.files)
      : [];
  if (missingCssModules.length) {
    const contentTypeError = validateFileContentType(action.path || '', action.content || '');
    const syntaxError = validateContentSyntax(action.path || '', action.content || '');
    if (!contentTypeError && !syntaxError) {
      state.deferredSourceWrite = {
        path: action.path || '',
        content: action.content || '',
        stylesheets: missingCssModules,
      };
      state.forcedRecoveryTargetPath = missingCssModules[0];
      state.unchangedReadSkips = 0;
      const result = `Queued ${action.path}. Your next action must write ${missingCssModules[0]} with the complete CSS Module needed by that component. Do not list, search, or read files again.`;
      state.messages.push({ role: 'user', content: observation(action.action, false, result) });
      state.context.record(action.action, result);
      state.onEvent({
        type: 'observation',
        turn,
        action,
        error: true,
        message: result,
        agentRole: state.agentRole,
      });
      return 'continue';
    }
  }
  if (action.action === 'write_file') {
    const targetPath = action.path || '';
    state.failedWritePath = targetPath || state.failedWritePath;
    const hasStagedTarget = state.workspace.changes().some((change) => change.path === targetPath);
    // Keep the latest rejected candidate in the next repair prompt. Preserving the first
    // failed source made repeated repairs solve an obsolete version of the file and could
    // trap small models in the same validation loop.
    state.failedWriteContent = hasStagedTarget
      ? ''
      : action.content?.trim()
        ? action.content
        : state.failedWriteContent;
    state.failedWriteDiagnostic = err.message;
    state.forcedWriteRecoveryPending = true;
    state.forcedRecoveryTargetPath = action.path || state.forcedRecoveryTargetPath;

    if (
      /undeclared (?:event handler|function|state setter)|references undeclared|calls undeclared/i.test(
        err.message,
      )
    ) {
      state.declarationRepairAttempts += 1;
      if (state.declarationRepairAttempts >= state.validationRepairLimit) {
        throw new AgentExecutionError(
          `The local model could not produce valid source for ${targetPath || 'the target file'} after ${state.validationRepairLimit} declaration repairs. Staged changes were preserved for review; retry with a stronger model or a narrower request.`,
          state.workspace.changes(),
        );
      }
    }
  }
  if (
    action.action === 'write_file' &&
    /\.module\.css$/i.test(stylesheetPath) &&
    /Unclosed '\{'|Unmatched '\}'/.test(err.message)
  ) {
    const attempts = (state.failedStylesheetWrites.get(stylesheetPath) || 0) + 1;
    state.failedStylesheetWrites.set(stylesheetPath, attempts);
    if (attempts >= 2) {
      const fallback = state.resolvedStyleProfile
        ? cssModuleRecovery(
            state.deferredSourceWrite?.content || '',
            state.resolvedStyleProfile,
            stylesheetPath,
          )
        : '.component {\n  display: block;\n}\n';
      state.workspace.write(stylesheetPath, fallback);
      state.validationState.wroteSinceVerification = true;
      state.failedWritePath = '';
      state.failedWriteContent = '';
      state.failedWriteDiagnostic = '';
      state.forcedWriteRecoveryPending = false;
      state.forcedRecoveryTargetPath = null;
      state.forcedWriteRecoveryViolations = 0;
      const message = `The local model repeatedly produced malformed CSS for ${stylesheetPath}. A safe minimal stylesheet was staged so implementation can continue.`;
      state.messages.push({ role: 'user', content: observation(action.action, true, message) });
      state.context.record('write_file', message);
      state.onEvent({ type: 'observation', turn, action, message, agentRole: state.agentRole });
      return 'continue';
    }
  }
  if (
    action.action === 'write_file' &&
    /not valid source code|only a placeholder|too short to fulfill|starter template|does not look like a working implementation/i.test(
      err.message,
    )
  ) {
    const target =
      action.path || recoveryWritePath(state.workspace.files, state.activeFile) || 'src/App.jsx';
    state.forcedWriteRecoveryPending = true;
    state.forcedRecoveryTargetPath = target;
    state.failedWritePath = target;
    recordFailedWriteAttempt(state, target);
    const message = state.lightweightModel
      ? `${err.message} Reply with ONLY a labelled code fence containing complete working source for ${target}, including state and event handlers when the request is interactive.`
      : `${err.message} Return a complete working implementation for ${target} as source code, not a sentence describing the request.`;
    state.messages.push({ role: 'user', content: observation(action.action, false, message) });
    state.context.record('write_file', message);
    state.onEvent({
      type: 'observation',
      turn,
      action,
      error: true,
      message,
      agentRole: state.agentRole,
    });
    return 'continue';
  }
  if (
    action.action === 'write_file' &&
    /\.(?:jsx|tsx|js|ts)$/i.test(action.path || '') &&
    /(?:bracket|string literal|Unclosed|Unterminated|Expected|Invalid|Unexpected|Parse error|Syntax error|ReactDOM bootstrap|CSS-style object|nested code fence)/i.test(
      err.message,
    )
  ) {
    state.malformedSourceAttempts += 1;
    const target =
      action.path || recoveryWritePath(state.workspace.files, state.activeFile) || 'src/App.jsx';
    if (state.lightweightModel) {
      state.forcedWriteRecoveryPending = true;
      state.forcedRecoveryTargetPath = target;
      state.failedWritePath = target;
    }
    if (state.malformedSourceAttempts >= state.malformedSourceAttemptLimit) {
      throw new AgentExecutionError(
        `The local model repeatedly produced malformed source for ${target} (${state.malformedSourceAttempts} attempts). Staged changes were preserved for review; retry with a stronger model or a narrower request.`,
        state.workspace.changes(),
      );
    }
    const targetedRecovery =
      writeRecovery(target, err.message, state.workspace.files) ||
      writeRecovery(target, 'Unmatched bracket', state.workspace.files);
    const message = state.lightweightModel
      ? `${err.message}${targetedRecovery} Reply with ONLY a labelled code fence containing complete working source for ${target}. Check every bracket, quote, and JSX tag before responding. Do not return JSON.`
      : `${err.message}${targetedRecovery || ` Return complete working source for ${target} with balanced brackets, quotes, and JSX tags. Do not return prose.`}`;
    state.messages.push({ content: observation(action.action, false, message), role: 'user' });
    state.context.record('malformed_source_recovery', message);
    state.onEvent({
      type: 'observation',
      turn,
      action,
      error: true,
      message,
      agentRole: state.agentRole,
    });
    return 'continue';
  }
  let recovery = '';
  if (action.action === 'read_file' && /^File not found: /.test(err.message)) {
    recovery =
      ' The requested file is absent. Do not call read_file for this path again. If this is a new component or stylesheet you need, create it with write_file; otherwise use one of the paths returned by list_files.';
  } else if (action.action === 'write_file') {
    recovery = /Missing CSS Module import/.test(err.message)
      ? ` The source file was not staged. Create the missing co-located stylesheet now: ${err.message.replace(/^.*?: /, '').replace(/\.$/, '')}. Then retry the source file with its CSS Module import.`
      : writeRecovery(action.path || '', err.message, state.workspace.files);
  } else if (action.action === 'delete_file' && /Cannot delete CSS Module/.test(err.message)) {
    recovery =
      ' The stylesheet was not deleted. Update or remove its importing component files first, then retry the deletion.';
  }
  if (action.action === 'write_file' && recovery) {
    state.failedWritePath = action.path || '';
  }
  const diagnostic = `${err.message}${recovery}`;
  state.messages.push({ role: 'user', content: observation(action.action, false, diagnostic) });
  state.onEvent({
    type: 'observation',
    turn,
    action,
    error: true,
    message: diagnostic,
    agentRole: state.agentRole,
  });
  return 'continue';
};

export const executeActionStep = async (
  state: ActionLoopState,
  turn: number,
  initialAction: ActionLoopAction,
  fingerprint: string,
): Promise<ActionLoopStepOutcome> => {
  let action = initialAction;
  try {
    let result: string | undefined;
    if (action.action === 'list_files') {
      state.onEvent({ type: 'tool', turn, action, agentRole: state.agentRole });
      result = state.workspace.list(action.query).join('\n');
    }
    if (action.action === 'search_workspace') {
      state.onEvent({ type: 'tool', turn, action, agentRole: state.agentRole });
      result = String(await state.workspace.search(action.query || '', action.glob));
    }
    if (action.action === 'search_semantic') {
      state.onEvent({ type: 'tool', turn, action, agentRole: state.agentRole });
      if (!state.retrieveContext)
        throw new Error('Semantic search is unavailable in this session.');
      result = await state.workspace.semanticSearch(
        action.query || '',
        state.retrieveContext,
        action.k,
      );
    }
    if (action.action === 'read_file') {
      state.onEvent({ type: 'tool', turn, action, agentRole: state.agentRole });
      const path = action.path || '';
      if (Object.hasOwn(state.workspace.files, path)) {
        result = state.workspace.read(path);
        state.lastReadContents.set(path, state.workspace.files[path]);
      } else {
        result = `File not found: ${path}. Do not read it again. If you need a new component or stylesheet there, create it with write_file; otherwise continue with the existing workspace files.`;
      }
    }
    if (action.action === 'write_file') {
      const writeOutcome = await executeWriteFile(state, turn, action);
      action = writeOutcome.action;
      if (writeOutcome.kind === 'continue') return { kind: 'continue' };
      result = writeOutcome.result;
    }
    if (action.action === 'replace_file_content') {
      const { path, content: newContent } = applyReplaceFileContent({
        action,
        files: state.workspace.files,
        request: state.request,
        lightweightModel: state.enforceFulfillment,
        taskContract: state.taskContract,
      });
      state.workspace.write(path, newContent);
      markWorkspaceMutated(state);
      clearFailedWriteAttempts(state);
      state.onEvent({ type: 'tool', turn, action, agentRole: state.agentRole });
      result = `Replaced target content in ${path}.`;
    }
    if (action.action === 'delete_file') {
      const path = action.path || '';
      assertTaskPathAllowed(state.taskContract, path);
      assertDeletableFile(path, state.workspace.files);
      state.workspace.delete(path);
      markWorkspaceMutated(state);
      state.onEvent({ type: 'tool', turn, action, agentRole: state.agentRole });
      result = `Staged deletion of ${action.path}.`;
    }
    if (action.action === 'validate') {
      result = await state.runValidation(turn, 'model');
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
      }
      if (
        state.workspace.changes().length > 0 &&
        !state.validationState.lastValidationFailed &&
        !isFailedValidationResult(result)
      ) {
        result = `${result}\nValidation passed for the staged changes. Your next action must be finish with a brief summary. Do not validate again.`;
      }
    }
    if (action.action === 'list_project_checks') {
      state.onEvent({ type: 'tool', turn, action, agentRole: state.agentRole });
      result = listProjectChecks(state.workspace.files).join('\n') || 'No eligible project checks.';
    }
    if (action.action === 'run_project_check') {
      state.onEvent({ type: 'tool', turn, action, agentRole: state.agentRole });
      const checkResult = await runProjectCheck({
        check: action.check || '',
        files: state.workspace.files,
        run: state.executeProjectCheck,
      });
      result = formatVerificationResult(checkResult);
      state.context.record('project-check', checkResult);
    }
    if (action.action === 'inspect_preview') {
      result = await state.inspectPreviewForLoop(turn);
    }
    if (action.action === 'inspect_console_logs') {
      state.onEvent({ type: 'tool', turn, action, agentRole: state.agentRole });
      result = inspectConsoleLogs(action, state.workspace.files);
    }
    if (action.action === 'get_file_symbols') {
      state.onEvent({ type: 'tool', turn, action, agentRole: state.agentRole });
      result = inspectFileSymbols(action, state.workspace.files);
    }
    if (action.action === 'manage_packages') {
      state.onEvent({ type: 'tool', turn, action, agentRole: state.agentRole });
      const packageResult = manageWorkspacePackages(action, state.workspace.files);
      if (packageResult.updatedPackageJson) {
        state.workspace.write('package.json', packageResult.updatedPackageJson);
      }
      result = packageResult.result;
    }
    if (action.action === 'finish') {
      return await handleFinishAction(state, turn, action);
    }
    state.messages.push({ role: 'user', content: observation(action.action, true, result) });
    state.context.record(action.action, result);
    state.onEvent({
      type: 'observation',
      turn,
      action,
      message: formatReasoningResult(action, result),
      agentRole: state.agentRole,
    });
    if (action.action === 'write_file' && state.hostAssistedWrite) {
      const autoFinishResult = await state.finishContextReadyWrite(turn);
      if (autoFinishResult) return { kind: 'return', result: autoFinishResult };
    }
    state.lastSuccessfulFingerprint = fingerprint;
    return { kind: 'proceed' };
  } catch (error) {
    return { kind: handleActionExecutionError(state, turn, action, error) };
  }
};
