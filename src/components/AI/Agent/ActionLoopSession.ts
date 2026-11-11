import { assessSmallModelRequest } from '@/components/AI/ReliabilityContracts';
import type { AgentEventHandler, FileMap, WebLLMMessage } from '@/components/AI/types';
import {
  buildContextReadyUserRequest,
  buildUserRequest,
  recoveryWritePath,
  wireNewComponentIntoScratchEntry,
} from './ActionLoopRecovery';
import {
  type ActionLoopSessionPolicy,
  generationGuidanceForRequest,
  isNewAppGenerationRequest,
  resolveActionLoopSessionPolicy,
  validateModularGenerationFiles,
} from './ActionLoopSmallModel';
import { isFailedValidationResult, observation } from './ActionLoopUtils';
import type { AgentContextManager } from './ContextManager';
import { type ProjectStyleProfile, resolveProjectStyleProfile } from './ProjectStyleProfile';
import type { AgentWorkspace } from './Workspace';

const VISUAL_QUALITY_INSTRUCTION =
  'Visual quality is a hard requirement for UI requests: use a coherent palette with explicit page and surface colors, a readable type scale, bounded content widths, consistent spacing, and semantic CSS Module roles. Prefer fluid flex/grid layouts with min-width: 0, avoid accidental full-width controls and giant fixed dimensions, keep interactive controls usable at narrow widths, and include visible hover, disabled, and focus-visible states. Correct runtime errors, unreadable contrast, horizontal overflow, collapsed controls, or broken layout before finishing.';

export function createActionLoopOpening({
  request,
  scope,
  activeFile,
  selectedLines = [],
  files,
  model,
  priorContext = '',
  agentRole = null,
  systemPrompt,
  allowedActions,
  visualMode,
  styleProfile,
  conversationContext,
}: {
  request: string;
  scope?: string;
  activeFile?: string | null;
  selectedLines?: number[];
  files: FileMap;
  model: string;
  priorContext?: string;
  agentRole?: string | null;
  systemPrompt: string;
  allowedActions: string[];
  visualMode: boolean;
  styleProfile?: ProjectStyleProfile;
  conversationContext: string;
}): ActionLoopSessionPolicy & {
  lightweightTargetPath: string;
  resolvedStyleProfile: ProjectStyleProfile | undefined;
  messages: WebLLMMessage[];
} {
  const policy = resolveActionLoopSessionPolicy({
    request,
    model,
    priorContext,
    agentRole,
    allowedActions,
    systemPrompt,
  });
  const lightweightTargetPath = recoveryWritePath(files, activeFile, request) || 'src/App.jsx';
  const resolvedStyleProfile = policy.hostAssistedSession
    ? resolveProjectStyleProfile(files, styleProfile)
    : undefined;
  const userRequest = policy.useContextReadyPrompt
    ? buildContextReadyUserRequest({
        request,
        targetPath: lightweightTargetPath,
        files,
        priorContext,
        lightweight: policy.lightweightModel,
        styleProfile: resolvedStyleProfile,
        responsiveGeneration: isNewAppGenerationRequest(request),
        hostGuidance: assessSmallModelRequest(request, model).guidance,
        includeProductContract: policy.hostAssistedWrite,
        modularGeneration: policy.modularGeneration,
      })
    : [
        buildUserRequest({
          request,
          scope,
          activeFile,
          selectedLines,
          priorContext: conversationContext,
        }),
        ...(policy.modularGeneration
          ? [
              `Modular app entry path: ${lightweightTargetPath}. Its stylesheet path is ${lightweightTargetPath.replace(/\.(?:[jt]sx?)$/i, '.module.css')}. Use these exact paths in the path-labelled files.`,
            ]
          : []),
      ].join('\n\n');
  const messages: WebLLMMessage[] = [
    { role: 'system', content: policy.agentSystemPrompt },
    {
      role: 'user',
      content: [
        userRequest,
        ...(visualMode || policy.hostAssistedSession ? [VISUAL_QUALITY_INSTRUCTION] : []),
        ...(!policy.useContextReadyPrompt
          ? generationGuidanceForRequest(request, {
              interactiveContract: policy.lightweightModel,
              targetPath: lightweightTargetPath,
              lightweight: policy.lightweightModel,
              modularGeneration: policy.modularGeneration,
            })
          : []),
      ].join('\n\n'),
    },
  ];
  return {
    ...policy,
    lightweightTargetPath,
    resolvedStyleProfile,
    messages,
  };
}

export const handleActionLoopDirectReply = async ({
  replyText,
  workspace,
  taskContract,
  validate,
  runValidation,
  turn,
  directChangesRecoveryPending,
  forcedWriteRecoveryPending,
  directRepairAttempts,
  activeFile,
  previewInspectionRequired,
  previewInspectState,
  inspectPreview,
  onEvent,
  agentRole,
  hostAssistedSession,
  modularGeneration,
  modularOutputFailures,
  request,
  modularTargetPath,
  applyCssModuleRecovery,
  autoFinishSummary,
  context,
  clearFailedWriteAttempts,
  messages,
}: {
  replyText: string;
  workspace: AgentWorkspace;
  taskContract: import('@/components/AI/types').TaskContract;
  validate?: ((files: FileMap) => Promise<unknown> | unknown) | null;
  runValidation: (turn: number, provenance?: 'model' | 'recovery') => Promise<string>;
  turn: number;
  directChangesRecoveryPending: boolean;
  forcedWriteRecoveryPending: boolean;
  directRepairAttempts: number;
  activeFile?: string | null;
  previewInspectionRequired: boolean;
  previewInspectState: {
    inspectedPreview: boolean;
    previewInspectionAccepted: boolean;
    lastPreviewResult: string;
  };
  inspectPreview?: ((files: FileMap) => Promise<unknown>) | null;
  onEvent: AgentEventHandler;
  agentRole: string | null;
  hostAssistedSession: boolean;
  modularGeneration: boolean;
  modularOutputFailures: number;
  request: string;
  modularTargetPath: string;
  applyCssModuleRecovery: (turn: number) => string[];
  autoFinishSummary: (
    reason: 'validate' | 'fulfillment' | 'identical-write' | 'unchanged-reads' | 'safety-limit',
    wiredEntry: string | null,
  ) => string;
  context: AgentContextManager;
  clearFailedWriteAttempts: () => void;
  messages: WebLLMMessage[];
}): Promise<
  | {
      kind: 'handled';
      result?: import('@/components/AI/types').RunAgentResult;
      modularOutputFailures?: number;
      directRepairAttempts?: number;
    }
  | {
      kind: 'repair';
      failedWritePath: string;
      failedWriteContent: string;
      failedWriteDiagnostic: string;
      directRepairAttempts: number;
    }
  | { kind: 'unhandled' }
> => {
  const { parseModelResult } = await import('./ManagerProtocol');
  const { validateAIChanges } = await import('../ChangeValidator');
  const { isTaskPathAllowed } = await import('../ReliabilityContracts');
  const { AgentExecutionError } = await import('./ActionLoopErrors');
  const { visualPreviewInspectionFailure } = await import('./VisualPreviewEvidence');

  try {
    const directResult = parseModelResult(replyText);
    if (modularGeneration && directResult.kind !== 'changes') return { kind: 'unhandled' };
    const singleFileModularFallback =
      modularGeneration &&
      directResult.kind === 'changes' &&
      directResult.changes.length === 1 &&
      (directResult.changes[0].path || directResult.changes[0].filePath) === modularTargetPath;
    const enforceModularGeneration = modularGeneration && !singleFileModularFallback;
    if (singleFileModularFallback) {
      const message =
        'The local model returned a single app file instead of the requested modular bundle. The host will use CSS Module recovery for this response.';
      context.record('modular_generation_single_file_fallback', message);
      onEvent({
        type: 'observation',
        turn,
        action: { action: 'write_file', path: modularTargetPath },
        message,
        agentRole,
      });
    }
    if (directResult.kind === 'changes' && directResult.changes.length) {
      if (enforceModularGeneration) {
        const missingFiles = validateModularGenerationFiles(
          request,
          modularTargetPath,
          directResult.changes.map((change) => ({
            ...change,
            path: change.path || change.filePath || '',
          })),
        );
        if (missingFiles.length) {
          const nextFailureCount = modularOutputFailures + 1;
          if (nextFailureCount >= 2) {
            throw new AgentExecutionError(
              `The local model repeatedly omitted required modular app files: ${missingFiles.join(', ')}.`,
              workspace.changes(),
            );
          }
          messages.push({
            role: 'user',
            content: observation(
              'changes',
              false,
              `The response does not meet modular app requirements: ${missingFiles.join(', ')}. Return the complete path-labelled file bundle with every required component and CSS Module.`,
            ),
          });
          return { kind: 'handled', modularOutputFailures: nextFailureCount };
        }
      }
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
        if (enforceModularGeneration) {
          const nextFailureCount = modularOutputFailures + 1;
          if (nextFailureCount >= 2) {
            throw new AgentExecutionError(
              `The local model repeatedly returned invalid modular files: ${validation.rejected.join('\n')}`,
              workspace.changes(),
            );
          }
          messages.push({
            role: 'user',
            content: observation(
              'changes',
              false,
              `${validation.rejected.join('\n') || 'No usable changes were returned.'}\nReturn the complete corrected path-labelled bundle with every required component and CSS Module.`,
            ),
          });
          return { kind: 'handled', modularOutputFailures: nextFailureCount };
        }
        messages.push({
          role: 'user',
          content: observation(
            'changes',
            false,
            validation.rejected.join('\n') || 'No usable changes were returned.',
          ),
        });
        return { kind: 'handled' };
      }
      for (const change of validation.accepted) {
        if (change.after === undefined) workspace.delete(change.path);
        else workspace.write(change.path, change.after);
      }
      clearFailedWriteAttempts();
      if (hostAssistedSession) applyCssModuleRecovery(turn);
      let verification = '';
      if (validate) {
        verification = await runValidation(
          turn,
          directChangesRecoveryPending || forcedWriteRecoveryPending ? 'recovery' : 'model',
        );
      }
      if (verification.includes('"status":"failed"')) {
        const nextRepairAttempts = directRepairAttempts + 1;
        if (nextRepairAttempts > 2) {
          throw new AgentExecutionError(verification, workspace.changes());
        }
        if (enforceModularGeneration) {
          messages.push({
            role: 'user',
            content: observation(
              'validate',
              false,
              `${verification}\nReturn the corrected complete path-labelled bundle, including the app entry, its CSS Module, and every component and co-located CSS Module.`,
            ),
          });
          return { kind: 'handled', directRepairAttempts: nextRepairAttempts };
        }
        const nextFailedPath =
          changes.find((change) => change.after !== undefined)?.path ||
          recoveryWritePath(workspace.files, activeFile) ||
          '';
        messages.push({
          role: 'user',
          content: observation(
            'validate',
            false,
            `${verification}\nReturn a corrected kind=changes response with complete file contents.`,
          ),
        });
        return {
          kind: 'repair',
          failedWritePath: nextFailedPath,
          failedWriteContent: nextFailedPath ? workspace.files[nextFailedPath] || '' : '',
          failedWriteDiagnostic: verification,
          directRepairAttempts: nextRepairAttempts,
        };
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
          return { kind: 'handled' };
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
        kind: 'handled',
        result: {
          changes: changesResult,
          files: workspace.files,
          summary: `${summary}${previewSummary}`,
          events: turn,
          workspace,
        },
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
            return {
              kind: 'handled',
              result: { changes, files: workspace.files, summary, events: turn, workspace },
            };
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
      return { kind: 'handled' };
    }
  } catch (directError) {
    if (directError instanceof AgentExecutionError) throw directError;
  }
  return { kind: 'unhandled' };
};
