import { validateProjectPath } from './ChangeValidator';
import { COMPLETION_RESPONSE_FORMAT } from './CompletionResponseFormat';
import type {
  FileMap,
  ModelCapabilityProfile,
  ModelResponseFormat,
  ModelTask,
  ModelTaskKind,
  SmallModelRequestAssessment,
  TaskContract,
} from './types';

export const AI_RELIABILITY_CONTRACT_VERSION = 1 as const;
export const MAX_RELIABILITY_MODEL_CALLS = 16;
export const MAX_RELIABILITY_REPAIR_ROUNDS = 2;

const CHANGE_REQUEST =
  /\b(?:add|build|change|create|delete|design|edit|fix|implement|improve|make|modify|refactor|remove|rename|replace|style|update|write)\b/i;
const UI_REQUEST =
  /\b(?:app|application|button|card|component|dashboard|form|interface|layout|list|menu|modal|page|screen|table|todo|ui|widget|website|visual|responsive)\b/i;

const DEMANDING_REQUEST =
  /\b(?:architect(?:ure|ing)?|redesign\s+(?:the\s+)?(?:entire|whole)|migrat(?:e|ion)|rewrite\s+(?:the\s+)?(?:entire|whole|all)|across\s+(?:the\s+)?(?:codebase|project|app|files)|multi[- ]file|multiple\s+files|every\s+file|all\s+files|entire\s+(?:codebase|project)|split\s+into\s+components|extract\s+(?:into|to)\s+components|monorepo)\b/i;
const MODERATE_REQUEST =
  /\b(?:refactor|restructure|reorganiz|decompose|modulari[sz]e|add\s+(?:a\s+)?(?:new\s+)?(?:page|route|screen)|multi[- ]step|and\s+also)\b/i;

const allowedWorkspacePaths = (files: FileMap): string[] => {
  const roots = new Set(
    Object.keys(files).map((path) => {
      const slash = path.indexOf('/');
      return slash < 0 ? path : `${path.slice(0, slash + 1)}`;
    }),
  );
  roots.add('src/');
  roots.add('public/');
  roots.add('package.json');
  roots.add('index.html');
  return [...new Set([...Object.keys(files), ...roots])].sort();
};

export function buildTaskContract({
  request,
  scope = 'file',
  activeFile = null,
  files,
}: {
  request: string;
  scope?: 'file' | 'project';
  activeFile?: string | null;
  files: FileMap;
}): TaskContract {
  const isChange = CHANGE_REQUEST.test(request);
  const isUi = isChange && UI_REQUEST.test(request);
  const acceptanceCriteria = [
    'Use only safe project-relative paths and preserve unrelated workspace content.',
    isChange
      ? 'Return complete working changes that fulfill the request without placeholders.'
      : 'Ground the response in the supplied workspace evidence.',
    activeFile ? `Respect the active-file scope centered on ${activeFile}.` : '',
    isUi
      ? 'Render the requested interface without runtime errors and pass preview accessibility and style evidence.'
      : '',
  ].filter(Boolean);
  return {
    version: AI_RELIABILITY_CONTRACT_VERSION,
    request: request.trim(),
    scope,
    activeFile,
    allowedPaths: allowedWorkspacePaths(files),
    acceptanceCriteria,
    requiredValidations: isUi
      ? ['content', 'build', 'preview', 'console']
      : isChange
        ? ['content', 'build']
        : ['content'],
    maxModelCalls: MAX_RELIABILITY_MODEL_CALLS,
    maxRepairRounds: MAX_RELIABILITY_REPAIR_ROUNDS,
  };
}

export function isTaskPathAllowed(contract: TaskContract, path: string): boolean {
  if (validateProjectPath(path)) return false;
  return contract.allowedPaths.some((allowed) =>
    allowed.endsWith('/') ? path.startsWith(allowed) : path === allowed,
  );
}

export function assertTaskPathAllowed(contract: TaskContract, path: string): void {
  if (!isTaskPathAllowed(contract, path)) {
    throw new Error(`Target path is outside the task contract: ${path || 'missing'}`);
  }
}

export function getModelCapabilityProfile(modelId: string): ModelCapabilityProfile {
  if (/(?:0\.5|0\.8|1\.5)B(?:-|$)/i.test(modelId)) {
    return {
      tier: 'recovery',
      contextWindowSize: 4096,
      generationTokens: 2000,
      recoveryTokens: 2600,
      filesPerGeneration: 1,
      supportsAllTaskKinds: true,
      hostAssistance: 'enhanced',
      maxContextFiles: 2,
      maxContextChars: 6000,
      temperature: 0.02,
      topP: 0.8,
    };
  }
  if (/(?:2|3)B(?:-|$)/i.test(modelId)) {
    const enhanced = /2B(?:-|$)/i.test(modelId);
    return {
      tier: 'compact',
      contextWindowSize: 4096,
      generationTokens: 2000,
      recoveryTokens: 2600,
      filesPerGeneration: 1,
      supportsAllTaskKinds: true,
      hostAssistance: enhanced ? 'enhanced' : 'standard',
      maxContextFiles: enhanced ? 3 : 4,
      maxContextChars: enhanced ? 8000 : 12000,
      temperature: enhanced ? 0.05 : 0.1,
      topP: enhanced ? 0.85 : 0.8,
    };
  }
  return {
    tier: 'recommended',
    contextWindowSize: 4096,
    generationTokens: 2000,
    recoveryTokens: 2600,
    filesPerGeneration: 1,
    supportsAllTaskKinds: true,
    hostAssistance: 'standard',
    maxContextFiles: 6,
    maxContextChars: 28000,
    temperature: 0.15,
    topP: 0.8,
  };
}

/**
 * Classify whether a request should stay single-file under enhanced host assistance.
 * Demanding work still runs, but the host narrows scope and surfaces escalate guidance.
 */
export function assessSmallModelRequest(
  request: string,
  modelId: string,
): SmallModelRequestAssessment {
  const profile = getModelCapabilityProfile(modelId);
  if (profile.hostAssistance !== 'enhanced') {
    return {
      complexity: 'simple',
      forceSingleFile: false,
      preferEscalate: false,
      guidance: null,
    };
  }

  const text = request.trim();
  const demanding = DEMANDING_REQUEST.test(text);
  const moderate = !demanding && MODERATE_REQUEST.test(text);
  const complexity = demanding ? 'demanding' : moderate ? 'moderate' : 'simple';
  const recovery = profile.tier === 'recovery';

  if (demanding) {
    return {
      complexity,
      forceSingleFile: true,
      preferEscalate: true,
      guidance: recovery
        ? 'Host assistance: this recovery-tier model will edit one target file only. For multi-file architecture, migration, or codebase-wide refactors, switch to a larger cached model or narrow the request to a single component.'
        : 'Host assistance: this compact model will edit one target file only. Prefer a larger cached model for multi-file architecture or codebase-wide refactors.',
    };
  }

  if (moderate || recovery) {
    return {
      complexity,
      forceSingleFile: true,
      preferEscalate: false,
      guidance:
        'Host assistance: write one complete component file. The host owns CSS Modules, entry wiring, validation, and finish.',
    };
  }

  return {
    complexity,
    forceSingleFile: true,
    preferEscalate: false,
    guidance:
      'Host assistance: reply with one labelled source fence for the target file. The host generates missing CSS and finishes after validation.',
  };
}

export function responseFormatForTask(taskKind: ModelTaskKind): ModelResponseFormat | undefined {
  if (taskKind === 'plan-edit' || taskKind === 'answer') return { type: 'json_object' };
  if (taskKind === 'completion') return COMPLETION_RESPONSE_FORMAT;
  // File bodies remain raw text. The host owns the target path and stages the content.
  return undefined;
}

export function formatTaskContract(contract: TaskContract): string {
  return [
    `Reliability contract v${contract.version}`,
    `Scope: ${contract.scope}${contract.activeFile ? ` (${contract.activeFile})` : ''}`,
    `Allowed paths: ${contract.allowedPaths.join(', ')}`,
    `Acceptance:\n${contract.acceptanceCriteria.map((item) => `- ${item}`).join('\n')}`,
    `Required validation: ${contract.requiredValidations.join(', ')}`,
  ].join('\n');
}

export function formatModelTask(task: ModelTask): string {
  if (task.kind === 'completion') {
    return `Complete ${task.filePath} at the supplied cursor boundary.`;
  }
  const target = 'targetPath' in task ? `\nTarget path: ${task.targetPath}` : '';
  return `Task kind: ${task.kind}${target}\n${formatTaskContract(task.contract)}`;
}

/** Reject file-specific explanation claims that are absent from the supplied evidence. */
export function validateGroundedAnswer(answer: string, evidence: string): string | null {
  if (!answer.trim()) return 'The model returned an empty answer.';
  const mentionedPaths = [
    ...answer.matchAll(/(?:`|\b)((?:src|public|tests?|scripts)\/[\w./-]+\.[A-Za-z0-9]+)(?:`|\b)/g),
  ].map((match) => match[1]);
  const unsupported = [...new Set(mentionedPaths)].filter((path) => !evidence.includes(path));
  return unsupported.length
    ? `The answer referenced files that were not present in workspace evidence: ${unsupported.join(', ')}`
    : null;
}
