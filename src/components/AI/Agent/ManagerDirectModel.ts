import { validateAIChanges } from '../ChangeValidator';
import { responseFormatForTask, validateGroundedAnswer } from '../ReliabilityContracts';
import type {
  ManagerEventHandler,
  ManagerPlan,
  ManagerToolName,
  ModelCapabilityProfile,
  ModelResult,
  RunManagerOptions,
  WebLLMMessage,
} from '../types';
import {
  contextText,
  normalizeModelChanges,
  planIncludesTool,
  summarizeToolResult,
} from './ManagerContextUtils';
import { loadManagerModel } from './ManagerModelClient';
import {
  MANAGER_SYSTEM_PROMPT,
  buildManagerModelPrompt,
  parseModelResult,
} from './ManagerProtocol';
import {
  type ManagerToolResult,
  type createManagerToolContext,
  executeManagerTool,
} from './ManagerTools';
import type { AgentWorkspace } from './Workspace';

const MAX_CONTEXT_ROUNDS = 3;
const MAX_REPAIR_ATTEMPTS = 2;

type DirectModelArgs = {
  request: string;
  model: string;
  plan: ManagerPlan;
  modelProfile: ModelCapabilityProfile;
  toolResults: ManagerToolResult[];
  tools: ReturnType<typeof createManagerToolContext>;
  workspace: AgentWorkspace;
  signal?: AbortSignal;
  onEvent: ManagerEventHandler;
  onMetrics?: RunManagerOptions['onMetrics'];
  onRecovery?: RunManagerOptions['onRecovery'];
  modelClient?: RunManagerOptions['modelClient'];
  seed?: number;
  inspectPreview?: RunManagerOptions['inspectPreview'];
  notifyTool: (
    tool: ManagerToolName,
    input?: Record<string, unknown>,
  ) => Promise<ManagerToolResult>;
};

/** Explanation / direct-changes manager path with bounded repair (non-action-loop). */
export async function runManagerDirectModelPath({
  request,
  model,
  plan,
  modelProfile,
  toolResults,
  tools,
  workspace,
  signal,
  onEvent,
  onMetrics,
  onRecovery,
  modelClient,
  seed,
  inspectPreview,
  notifyTool,
}: DirectModelArgs): Promise<{
  changes: ReturnType<AgentWorkspace['changes']>;
  files: AgentWorkspace['files'];
  summary: string;
  plan: ManagerPlan;
  events: number;
  workspace: AgentWorkspace;
}> {
  const askModel = modelClient || (await loadManagerModel());
  const messages: WebLLMMessage[] = [{ role: 'system', content: MANAGER_SYSTEM_PROMPT }];
  let task: 'answer' | 'generate-changes' | 'repair-changes' =
    plan.intent === 'explanation' ? 'answer' : 'generate-changes';
  let result: ModelResult | null = null;
  let diagnostics = '';

  for (let round = 0; round < MAX_CONTEXT_ROUNDS; round++) {
    if (signal?.aborted) throw new DOMException('Manager stopped', 'AbortError');
    const prompt = buildManagerModelPrompt(
      request,
      contextText(toolResults, modelProfile.maxContextChars),
      task,
      diagnostics,
    );
    messages.push({ role: 'user', content: prompt });
    onEvent({
      type: 'model',
      turn: round + 1,
      task,
      message: `Calling the model for ${task}…`,
      input: prompt,
    });
    const reply = await askModel({
      model,
      messages,
      signal,
      task,
      onMetrics,
      temperature: modelProfile.temperature,
      top_p: modelProfile.topP,
      max_tokens: task === 'answer' ? 1200 : modelProfile.generationTokens,
      contextWindowSize: modelProfile.contextWindowSize,
      seed,
      responseFormat: responseFormatForTask('answer'),
      taskKind: 'answer',
      attempt: round + 1,
    });
    messages.push({ role: 'assistant', content: reply });
    onEvent({ type: 'model', turn: round + 1, task, output: reply });
    try {
      result = parseModelResult(reply);
      onEvent({ type: 'model', turn: round + 1, task, protocolStatus: 'valid' });
    } catch (error) {
      onEvent({
        type: 'model',
        turn: round + 1,
        task,
        error: true,
        protocolStatus: 'invalid',
        message: error instanceof Error ? error.message : String(error),
      });
      if (round === MAX_CONTEXT_ROUNDS - 1) throw error;
      diagnostics = `The previous model response was not valid manager JSON: ${
        error instanceof Error ? error.message : String(error)
      }. Return one valid JSON object matching the requested protocol.`;
      task = task === 'answer' ? 'answer' : 'generate-changes';
      continue;
    }
    if (
      task !== 'answer' &&
      (result.kind === 'answer' || (result.kind === 'changes' && result.changes.length === 0))
    ) {
      if (round === MAX_CONTEXT_ROUNDS - 1) {
        throw new Error('The model did not return changes for an edit request.');
      }
      diagnostics =
        'The previous model response did not return changes for an edit request. Return a kind=changes response with complete file contents.';
      task = task === 'repair-changes' ? 'repair-changes' : 'generate-changes';
      continue;
    }
    if (result.kind !== 'request-context') break;
    if (!result.requests.length) throw new Error('The model requested no usable context.');
    for (const requestContext of result.requests) {
      await notifyTool(requestContext.tool, requestContext.input || {});
    }
  }

  if (!result) throw new Error('The manager did not receive a model result.');
  if (task !== 'answer' && result.kind !== 'changes')
    throw new Error('The model did not return changes for an edit request.');
  if (result.kind === 'answer') {
    const groundingError = validateGroundedAnswer(
      result.summary,
      contextText(toolResults, modelProfile.maxContextChars),
    );
    if (groundingError) throw new Error(groundingError);
    onEvent({ type: 'finished', turn: messages.length, message: result.summary });
    return {
      changes: [],
      files: workspace.files,
      summary: result.summary,
      plan,
      events: messages.length,
      workspace,
    };
  }
  let changes = normalizeModelChanges(result, workspace.files);
  if (!changes.length) throw new Error('The model did not return any changes.');

  for (let repair = 0; repair <= MAX_REPAIR_ATTEMPTS; repair++) {
    const validation = validateAIChanges(changes);
    if (validation.accepted.length && validation.rejected.length === 0) {
      for (const change of validation.accepted) {
        if (change.after === undefined) workspace.delete(change.path);
        else workspace.write(change.path, change.after);
      }
      if (tools.validate) {
        const verification = await executeManagerTool({ tool: 'validate' }, tools);
        onEvent({
          type: 'validation',
          turn: repair + 1,
          message: 'Validating generated changes…',
          output: JSON.stringify(verification.value),
        });
        const status = (verification.value as { status?: string })?.status;
        const verificationMessage =
          verification.text || `Validation ${status || 'failed'} without diagnostics.`;
        if (status === 'failed' && repair < MAX_REPAIR_ATTEMPTS) {
          diagnostics = verificationMessage;
          task = 'repair-changes';
          toolResults.push(verification);
          const prompt = buildManagerModelPrompt(
            request,
            contextText(toolResults, modelProfile.maxContextChars),
            task,
            diagnostics,
          );
          messages.push({ role: 'user', content: prompt });
          onEvent({
            type: 'model',
            turn: repair + 2,
            task,
            message: 'Calling the model for repair-changes…',
            input: prompt,
          });
          const reply = await askModel({
            model,
            messages,
            signal,
            task,
            onMetrics,
            onRecovery,
            temperature: Math.min(modelProfile.temperature, 0.1),
            top_p: modelProfile.topP,
            max_tokens: modelProfile.generationTokens,
            contextWindowSize: modelProfile.contextWindowSize,
            seed: seed === undefined ? undefined : seed + repair + 1,
            responseFormat: responseFormatForTask('repair-file'),
            taskKind: 'repair-file',
            attempt: repair + 1,
          });
          messages.push({ role: 'assistant', content: reply });
          onEvent({ type: 'model', turn: repair + 2, task, output: reply });
          try {
            result = parseModelResult(reply);
            onEvent({ type: 'model', turn: repair + 2, task, protocolStatus: 'valid' });
          } catch (error) {
            onEvent({
              type: 'model',
              turn: repair + 2,
              task,
              error: true,
              protocolStatus: 'invalid',
              message: error instanceof Error ? error.message : String(error),
            });
            diagnostics = `${verificationMessage}\nThe repair response was invalid: ${
              error instanceof Error ? error.message : String(error)
            }. Return a kind=changes response with complete file contents.`;
            changes = [];
            continue;
          }
          if (result.kind !== 'changes' || !result.changes.length) {
            diagnostics = `${verificationMessage}\nThe repair response did not return any changes. Return a kind=changes response with complete file contents.`;
            changes = [];
            continue;
          }
          changes = normalizeModelChanges(result, workspace.files);
          if (!changes.length) {
            diagnostics = `${verificationMessage}\nThe repair response did not contain usable changes. Return a kind=changes response with complete file contents.`;
            changes = [];
            continue;
          }
          continue;
        }
        if (status === 'failed') throw new Error(verificationMessage);
      }
      let previewSummary = '';
      if (planIncludesTool(plan, 'inspect_preview') && inspectPreview) {
        const preview = await notifyTool('inspect_preview');
        previewSummary = `\n\nPreview inspection:\n${summarizeToolResult(preview.tool, preview.value)}`;
      }
      const summary =
        (result.kind === 'changes' ? result.summary : '') ||
        `Prepared ${changes.length} file(s) for review.`;
      onEvent({ type: 'finished', turn: messages.length, message: summary });
      return {
        changes: workspace.changes(),
        files: workspace.files,
        summary: `${summary}${previewSummary}`,
        plan,
        events: messages.length,
        workspace,
      };
    }
    diagnostics = validation.rejected.length
      ? validation.rejected.join('\n')
      : diagnostics || 'The previous repair response did not provide usable changes.';
    if (repair >= MAX_REPAIR_ATTEMPTS) {
      throw new Error(diagnostics || 'The generated changes failed deterministic validation.');
    }
    task = 'repair-changes';
    const prompt = buildManagerModelPrompt(
      request,
      contextText(toolResults, modelProfile.maxContextChars),
      task,
      diagnostics,
    );
    messages.push({ role: 'user', content: prompt });
    const reply = await askModel({
      model,
      messages,
      signal,
      task,
      onMetrics,
      onRecovery,
      temperature: Math.min(modelProfile.temperature, 0.1),
      top_p: modelProfile.topP,
      max_tokens: modelProfile.generationTokens,
      contextWindowSize: modelProfile.contextWindowSize,
      seed: seed === undefined ? undefined : seed + repair + 1,
      responseFormat: responseFormatForTask('repair-file'),
      taskKind: 'repair-file',
      attempt: repair + 1,
    });
    messages.push({ role: 'assistant', content: reply });
    try {
      result = parseModelResult(reply);
      onEvent({ type: 'model', turn: messages.length, task, protocolStatus: 'valid' });
    } catch (error) {
      onEvent({
        type: 'model',
        turn: messages.length,
        task,
        error: true,
        protocolStatus: 'invalid',
        message: error instanceof Error ? error.message : String(error),
      });
      diagnostics = `The repair response was invalid: ${
        error instanceof Error ? error.message : String(error)
      }. Return a kind=changes response with complete file contents.`;
      changes = [];
      continue;
    }
    if (result.kind !== 'changes' || !result.changes.length) {
      diagnostics =
        'The repair response did not return any changes. Return a kind=changes response with complete file contents.';
      changes = [];
      continue;
    }
    changes = normalizeModelChanges(result, workspace.files);
    if (!changes.length) {
      diagnostics =
        'The repair response did not contain usable changes. Return a kind=changes response with complete file contents.';
      changes = [];
    }
  }
  throw new Error('The manager exhausted its repair attempts.');
}
