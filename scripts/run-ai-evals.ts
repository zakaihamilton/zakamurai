import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type AIEvalBaseline,
  compareAIEvalResults,
  scoreAIEvalCase,
} from '../src/components/AI/AIEvals';
import { AI_EVAL_CASES } from '../tests/ai-evals/cases';

const baselinePath = resolve('tests/ai-evals/baseline.json');

async function main() {
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as AIEvalBaseline;
  const results = AI_EVAL_CASES.flatMap((testCase) =>
    testCase.modelIds.map((modelId) => scoreAIEvalCase(testCase, modelId)),
  );
  const failures = compareAIEvalResults(results, baseline);
  const summary = {
    version: 1,
    caseCount: AI_EVAL_CASES.length,
    resultCount: results.length,
    hardPassCount: results.filter((result) => result.hardPass).length,
    failures,
    results,
  };
  const reportFlag = process.argv.indexOf('--report');
  if (reportFlag >= 0) {
    const reportPath = process.argv[reportFlag + 1];
    if (!reportPath) throw new Error('--report requires a destination path.');
    await writeFile(resolve(reportPath), `${JSON.stringify(summary, null, 2)}\n`);
  }
  console.log(
    JSON.stringify(
      {
        caseCount: summary.caseCount,
        resultCount: summary.resultCount,
        hardPassCount: summary.hardPassCount,
        failures,
      },
      null,
      2,
    ),
  );
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
