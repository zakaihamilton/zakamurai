import { assessSmallModelRequest } from '@/components/AI/ReliabilityContracts';
import type { FileMap, WebLLMMessage } from '@/components/AI/types';
import {
  buildContextReadyUserRequest,
  buildUserRequest,
  recoveryWritePath,
} from './ActionLoopRecovery';
import {
  type ActionLoopSessionPolicy,
  generationGuidanceForRequest,
  isNewAppGenerationRequest,
  resolveActionLoopSessionPolicy,
} from './ActionLoopSmallModel';
import { type ProjectStyleProfile, resolveProjectStyleProfile } from './ProjectStyleProfile';

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
    model,
    priorContext,
    agentRole,
    allowedActions,
    systemPrompt,
  });
  const lightweightTargetPath = recoveryWritePath(files, activeFile) || 'src/App.jsx';
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
      })
    : buildUserRequest({
        request,
        scope,
        activeFile,
        selectedLines,
        priorContext: conversationContext,
      });
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
