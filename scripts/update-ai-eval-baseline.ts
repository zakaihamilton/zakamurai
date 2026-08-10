import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  AIEvalBaseline,
  AIEvalBaselineCategory,
  AIEvalCategory,
  AIEvalFloorSet,
  AIEvalQualificationBaseline,
  AIEvalQualificationProfile,
  AIEvalResult,
} from '../src/components/AI/AIEvals';

type QualificationReport = {
  profile?: AIEvalQualificationProfile;
  results?: AIEvalResult[];
};

const values = (flag: string): string[] => {
  const index = process.argv.indexOf(flag);
  return index < 0 ? [] : (process.argv[index + 1] || '').split(',').filter(Boolean);
};

const round = (value: number): number => Math.round(value * 1000) / 1000;
const caseKey = (result: AIEvalResult): string => `${result.modelId}::${result.caseId}`;

const sameProfile = (
  left: AIEvalQualificationProfile,
  right: AIEvalQualificationProfile,
): boolean => left.browser === right.browser && left.hardware === right.hardware;

const ratchetCeiling = (
  previous: number | null | undefined,
  observed: number | null,
): number | null =>
  typeof previous !== 'number'
    ? observed
    : observed === null
      ? previous
      : Math.min(previous, observed);

async function main() {
  const reportPaths = values('--qualification-reports');
  if (reportPaths.length !== 3) {
    throw new Error(
      'Baseline updates require exactly three qualification reports: --qualification-reports a.json,b.json,c.json',
    );
  }
  const reports = await Promise.all(
    reportPaths.map(
      async (path) => JSON.parse(await readFile(resolve(path), 'utf8')) as QualificationReport,
    ),
  );
  const profile = reports[0].profile;
  if (!profile?.browser || !profile.hardware) {
    throw new Error('Every qualification report must record a browser and hardware profile.');
  }
  if (reports.some((report) => !report.profile || !sameProfile(profile, report.profile))) {
    throw new Error('Qualification reports must use the same browser and hardware profile.');
  }
  if (
    reports.some((report) => {
      const observedSeeds = new Set((report.results || []).map((result) => result.seed));
      return !observedSeeds.has(101) || !observedSeeds.has(202) || !observedSeeds.has(303);
    })
  ) {
    throw new Error('Each qualification report must include the fixed seeds 101, 202, and 303.');
  }
  const results = reports.flatMap((report) => report.results || []);
  if (!results.length) throw new Error('Qualification reports contained no results.');
  const baselinePath = resolve('tests/ai-evals/baseline.json');
  const previous = JSON.parse(await readFile(baselinePath, 'utf8')) as AIEvalBaseline;
  const previousQualification = previous.qualificationBaselines.find((entry) =>
    sameProfile(entry.profile, profile),
  );
  const previousFloors: AIEvalFloorSet = previousQualification || {
    caseHardPass: {},
    models: {},
  };
  const models = [...new Set(results.map((result) => result.modelId))];
  const categories = [...new Set(results.map((result) => result.category))];
  const nextQualification: AIEvalQualificationBaseline = {
    profile,
    caseHardPass: { ...previousFloors.caseHardPass },
    models: structuredClone(previousFloors.models),
  };
  const scoreDeltas: Record<
    string,
    { previous: number | null; next: number; delta: number | null }
  > = {};
  for (const modelId of models) {
    const floors: Partial<Record<AIEvalCategory, AIEvalBaselineCategory>> = {};
    for (const category of categories) {
      const perRun = reports.map((report) =>
        (report.results || []).filter(
          (result) => result.modelId === modelId && result.category === category,
        ),
      );
      if (perRun.some((group) => !group.length)) continue;
      const passRates = perRun.map(
        (group) => group.filter((result) => result.hardPass).length / group.length,
      );
      const scores = perRun.map(
        (group) => group.reduce((sum, result) => sum + result.score, 0) / group.length,
      );
      const latencies = perRun.flatMap((group) =>
        group.flatMap((result) => (result.latencyMs === null ? [] : [result.latencyMs])),
      );
      const memories = perRun.flatMap((group) =>
        group.flatMap((result) => (result.memoryMB === null ? [] : [result.memoryMB])),
      );
      const repairAverages = perRun.map(
        (group) => group.reduce((sum, result) => sum + result.repairCount, 0) / group.length,
      );
      const fallbackAverages = perRun.map(
        (group) => group.reduce((sum, result) => sum + result.fallbackCount, 0) / group.length,
      );
      const previousFloor = previousFloors.models[modelId]?.[category];
      const observedPassFloor = round(Math.min(...passRates));
      const observedScoreFloor = round(Math.min(...scores));
      const observedLatencyCeiling = latencies.length
        ? Math.ceil(Math.max(...latencies) * 1.2)
        : null;
      const observedMemoryCeiling = memories.length ? Math.ceil(Math.max(...memories) * 1.2) : null;
      floors[category] = {
        minimumPassRate: Math.max(previousFloor?.minimumPassRate || 0, observedPassFloor),
        minimumAverageScore: Math.max(previousFloor?.minimumAverageScore || 0, observedScoreFloor),
        maximumP95LatencyMs: ratchetCeiling(
          previousFloor?.maximumP95LatencyMs,
          observedLatencyCeiling,
        ),
        maximumMemoryMB: ratchetCeiling(previousFloor?.maximumMemoryMB, observedMemoryCeiling),
        maximumAverageRepairCount: ratchetCeiling(
          previousFloor?.maximumAverageRepairCount,
          round(Math.max(...repairAverages)),
        ),
        maximumAverageFallbackCount: ratchetCeiling(
          previousFloor?.maximumAverageFallbackCount,
          round(Math.max(...fallbackAverages)),
        ),
      };
      const deltaKey = `${modelId}/${category}`;
      scoreDeltas[deltaKey] = {
        previous: previousFloor?.minimumAverageScore ?? null,
        next: floors[category].minimumAverageScore,
        delta:
          previousFloor === undefined
            ? null
            : round(floors[category].minimumAverageScore - previousFloor.minimumAverageScore),
      };
    }
    nextQualification.models[modelId] = {
      ...nextQualification.models[modelId],
      ...floors,
    };
  }
  for (const key of new Set(results.map(caseKey))) {
    nextQualification.caseHardPass[key] = results
      .filter((result) => caseKey(result) === key)
      .every((result) => result.hardPass);
  }
  const newlyPassing = Object.entries(nextQualification.caseHardPass)
    .filter(([key, passed]) => passed && previousFloors.caseHardPass[key] !== true)
    .map(([key]) => key);
  const newlyFailing = Object.entries(nextQualification.caseHardPass)
    .filter(([key, passed]) => !passed && previousFloors.caseHardPass[key] !== false)
    .map(([key]) => key);
  if (newlyFailing.length) {
    throw new Error(`Refusing to baseline newly failing hard cases: ${newlyFailing.join(', ')}`);
  }
  const next: AIEvalBaseline = {
    ...previous,
    qualificationBaselines: [
      ...previous.qualificationBaselines.filter((entry) => !sameProfile(entry.profile, profile)),
      nextQualification,
    ],
  };
  const previousText = `${JSON.stringify(previous, null, 2)}\n`;
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  await writeFile(baselinePath, serialized);
  console.log(
    JSON.stringify(
      {
        updated: baselinePath,
        changed: previousText !== serialized,
        profile,
        reports: reportPaths,
        models: Object.keys(nextQualification.models),
        scoreDeltas,
        newlyPassing,
        newlyFailing,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
