import { validateAIChanges, validateGeneratedPlaceholder } from './ChangeValidator';
import { validateGroundedAnswer } from './ReliabilityContracts';
import type { AgentChange } from './types';

export const AI_EVAL_VERSION = 1 as const;
export const AI_EVAL_BASELINE_VERSION = 1 as const;

export type AIEvalCategory = 'agent' | 'completion' | 'explanation' | 'lifecycle' | 'recovery';

export type AIEvalCandidate = {
  changes?: AgentChange[];
  completion?: string;
  answer?: string;
  evidence?: string;
  events?: string[];
  buildStatus?: 'passed' | 'failed';
  previewStatus?: 'passed' | 'failed' | 'not-required';
  mutatedInput?: boolean;
  latencyMs?: number;
  memoryMB?: number;
  repairCount?: number;
  fallbackCount?: number;
};

export type AIEvalCase = {
  version: typeof AI_EVAL_VERSION;
  id: string;
  category: AIEvalCategory;
  request: string;
  modelFacing: boolean;
  modelIds: string[];
  candidate: AIEvalCandidate;
  expected: {
    requiredIncludes?: string[];
    forbiddenIncludes?: string[];
    eventSequence?: string[];
    requireBuild?: boolean;
    requirePreview?: boolean;
  };
};

export type AIEvalResult = {
  version: typeof AI_EVAL_VERSION;
  caseId: string;
  category: AIEvalCategory;
  modelId: string;
  hardPass: boolean;
  score: number;
  failures: string[];
  latencyMs: number | null;
  memoryMB: number | null;
  repairCount: number;
  fallbackCount: number;
  seed: number | null;
};

export type AIEvalQualificationProfile = {
  browser: string;
  hardware: string;
};

export type AIEvalBaselineCategory = {
  minimumPassRate: number;
  minimumAverageScore: number;
  maximumP95LatencyMs: number | null;
  maximumMemoryMB: number | null;
  maximumAverageRepairCount?: number | null;
  maximumAverageFallbackCount?: number | null;
};

export type AIEvalFloorSet = {
  caseHardPass: Record<string, boolean>;
  models: Record<string, Partial<Record<AIEvalCategory, AIEvalBaselineCategory>>>;
};

export type AIEvalQualificationBaseline = AIEvalFloorSet & {
  profile: AIEvalQualificationProfile;
};

export type AIEvalBaseline = AIEvalFloorSet & {
  version: typeof AI_EVAL_BASELINE_VERSION;
  qualificationRunsRequired: 3;
  qualificationBaselines: AIEvalQualificationBaseline[];
};

const allText = (candidate: AIEvalCandidate): string =>
  [
    candidate.completion,
    candidate.answer,
    ...(candidate.changes || []).map((change) => change.after || change.content || ''),
  ]
    .filter(Boolean)
    .join('\n');

const isSubsequence = (expected: string[], actual: string[]): boolean => {
  let cursor = 0;
  for (const event of actual) {
    if (event === expected[cursor]) cursor += 1;
  }
  return cursor === expected.length;
};

export function scoreAIEvalCase(
  testCase: AIEvalCase,
  modelId: string,
  seed: number | null = null,
): AIEvalResult {
  const failures: string[] = [];
  const candidate = testCase.candidate;
  const text = allText(candidate);

  if (candidate.mutatedInput) failures.push('The run mutated caller-owned workspace input.');
  if (testCase.category === 'agent') {
    const validation = validateAIChanges(candidate.changes || []);
    if (!validation.accepted.length || validation.rejected.length) {
      failures.push(...(validation.rejected.length ? validation.rejected : ['No valid change.']));
    }
    for (const change of validation.accepted) {
      if (change.after === undefined) continue;
      const placeholder = validateGeneratedPlaceholder(change.path, change.after);
      if (placeholder) failures.push(placeholder);
    }
    if (testCase.expected.requireBuild && candidate.buildStatus !== 'passed') {
      failures.push('Required build validation did not pass.');
    }
    if (testCase.expected.requirePreview && candidate.previewStatus !== 'passed') {
      failures.push('Required preview validation did not pass.');
    }
  }
  if (testCase.category === 'completion') {
    if (!candidate.completion?.trim()) failures.push('Completion was empty.');
    if (/^(?:analysis|reasoning|explanation):/i.test(candidate.completion || '')) {
      failures.push('Completion leaked prose.');
    }
    if ((candidate.completion || '').length > 1200) failures.push('Completion exceeded its bound.');
  }
  if (testCase.category === 'explanation') {
    const grounding = validateGroundedAnswer(candidate.answer || '', candidate.evidence || '');
    if (grounding) failures.push(grounding);
  }
  if (testCase.expected.eventSequence) {
    if (!isSubsequence(testCase.expected.eventSequence, candidate.events || [])) {
      failures.push('Required event sequence was not observed.');
    }
  }
  for (const value of testCase.expected.requiredIncludes || []) {
    if (!text.includes(value)) failures.push(`Missing required output: ${value}`);
  }
  for (const value of testCase.expected.forbiddenIncludes || []) {
    if (text.includes(value)) failures.push(`Output contained forbidden content: ${value}`);
  }

  const criteriaCount =
    1 +
    (testCase.expected.requiredIncludes?.length || 0) +
    (testCase.expected.forbiddenIncludes?.length || 0) +
    (testCase.expected.eventSequence ? 1 : 0) +
    (testCase.expected.requireBuild ? 1 : 0) +
    (testCase.expected.requirePreview ? 1 : 0);
  const score = Math.max(0, Math.round(100 * (1 - failures.length / criteriaCount)));
  return {
    version: AI_EVAL_VERSION,
    caseId: testCase.id,
    category: testCase.category,
    modelId,
    hardPass: failures.length === 0,
    score,
    failures,
    latencyMs: Number.isFinite(candidate.latencyMs) ? candidate.latencyMs || 0 : null,
    memoryMB: Number.isFinite(candidate.memoryMB) ? candidate.memoryMB || 0 : null,
    repairCount: candidate.repairCount || 0,
    fallbackCount: candidate.fallbackCount || 0,
    seed,
  };
}

const percentile95 = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
};

export function compareAIEvalResults(results: AIEvalResult[], baseline: AIEvalFloorSet): string[] {
  const failures: string[] = [];
  for (const [key, previouslyPassed] of Object.entries(baseline.caseHardPass || {})) {
    if (!previouslyPassed) continue;
    const separator = key.indexOf('::');
    const modelId = key.slice(0, separator);
    const caseId = key.slice(separator + 2);
    const matching = results.filter(
      (result) => result.modelId === modelId && result.caseId === caseId,
    );
    if (matching.length && matching.some((result) => !result.hardPass)) {
      failures.push(`${modelId}/${caseId}: newly failing hard case.`);
    }
  }
  for (const [modelId, categories] of Object.entries(baseline.models)) {
    for (const [category, floor] of Object.entries(categories) as Array<
      [AIEvalCategory, AIEvalBaselineCategory]
    >) {
      const group = results.filter(
        (result) => result.modelId === modelId && result.category === category,
      );
      if (!group.length) {
        failures.push(`${modelId}/${category}: no evaluation results.`);
        continue;
      }
      const passRate = group.filter((result) => result.hardPass).length / group.length;
      const averageScore = group.reduce((sum, result) => sum + result.score, 0) / group.length;
      const p95Latency = percentile95(
        group.flatMap((result) => (result.latencyMs === null ? [] : [result.latencyMs])),
      );
      const maxMemory = Math.max(
        0,
        ...group.flatMap((result) => (result.memoryMB === null ? [] : [result.memoryMB])),
      );
      const averageRepairs =
        group.reduce((sum, result) => sum + result.repairCount, 0) / group.length;
      const averageFallbacks =
        group.reduce((sum, result) => sum + result.fallbackCount, 0) / group.length;
      if (passRate < floor.minimumPassRate) {
        failures.push(`${modelId}/${category}: pass rate ${passRate} < ${floor.minimumPassRate}.`);
      }
      if (averageScore < floor.minimumAverageScore) {
        failures.push(
          `${modelId}/${category}: average score ${averageScore} < ${floor.minimumAverageScore}.`,
        );
      }
      if (
        floor.maximumP95LatencyMs !== null &&
        p95Latency !== null &&
        p95Latency > floor.maximumP95LatencyMs
      ) {
        failures.push(
          `${modelId}/${category}: p95 latency ${p95Latency}ms > ${floor.maximumP95LatencyMs}ms.`,
        );
      }
      if (floor.maximumMemoryMB !== null && maxMemory > floor.maximumMemoryMB) {
        failures.push(
          `${modelId}/${category}: max memory ${maxMemory}MB > ${floor.maximumMemoryMB}MB.`,
        );
      }
      if (
        typeof floor.maximumAverageRepairCount === 'number' &&
        averageRepairs > floor.maximumAverageRepairCount
      ) {
        failures.push(
          `${modelId}/${category}: average repairs ${averageRepairs} > ${floor.maximumAverageRepairCount}.`,
        );
      }
      if (
        typeof floor.maximumAverageFallbackCount === 'number' &&
        averageFallbacks > floor.maximumAverageFallbackCount
      ) {
        failures.push(
          `${modelId}/${category}: average fallbacks ${averageFallbacks} > ${floor.maximumAverageFallbackCount}.`,
        );
      }
    }
  }
  return failures;
}

export function qualificationProfileMatches(
  baseline: AIEvalBaseline,
  profile: AIEvalQualificationProfile,
): boolean {
  return baseline.qualificationBaselines.some(
    (entry) =>
      entry.profile.browser === profile.browser && entry.profile.hardware === profile.hardware,
  );
}

export function matchingQualificationBaseline(
  baseline: AIEvalBaseline,
  profile: AIEvalQualificationProfile,
): AIEvalQualificationBaseline | null {
  return (
    baseline.qualificationBaselines.find(
      (entry) =>
        entry.profile.browser === profile.browser && entry.profile.hardware === profile.hardware,
    ) || null
  );
}
