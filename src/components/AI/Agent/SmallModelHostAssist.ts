import {
  assessSmallModelRequest,
  getModelCapabilityProfile,
} from '@/components/AI/ReliabilityContracts';
import type {
  ManagerEventHandler,
  ModelCapabilityProfile,
  SmallModelRequestAssessment,
} from '@/components/AI/types';

export type SmallModelHostAssist = {
  profile: ModelCapabilityProfile;
  assessment: SmallModelRequestAssessment;
  effectiveScope: 'file' | 'project';
};

/** Resolve capability profile, request assessment, and narrowed scope for small models. */
export function resolveSmallModelHostAssist(
  request: string,
  modelId: string,
  scope: 'file' | 'project',
): SmallModelHostAssist {
  const profile = getModelCapabilityProfile(modelId);
  const assessment = assessSmallModelRequest(request, modelId);
  return {
    profile,
    assessment,
    effectiveScope: assessment.forceSingleFile && scope === 'project' ? 'file' : scope,
  };
}

export function emitSmallModelHostGuidance(
  onEvent: ManagerEventHandler,
  assessment: SmallModelRequestAssessment,
): void {
  if (!assessment.guidance) return;
  onEvent({
    type: 'context',
    turn: 0,
    message: assessment.guidance,
  });
}

export function composeActionPriorContext({
  taskText,
  guidance,
  handoffContext,
  toolContext,
}: {
  taskText: string;
  guidance: string | null;
  handoffContext: string;
  toolContext: string;
}): string {
  return [taskText, guidance, handoffContext, toolContext].filter(Boolean).join('\n\n');
}
