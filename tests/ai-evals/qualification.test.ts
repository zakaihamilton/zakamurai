import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import baseline from './baseline.json';
import { describe, expect, it } from 'vitest';
import {
  type AIEvalBaseline,
  compareAIEvalResults,
  matchingQualificationBaseline,
  scoreAIEvalCase,
} from '@/components/AI/AIEvals';
import { COMPLETION_SYSTEM_PROMPT } from '@/components/AI/PromptTemplates';
import { responseFormatForTask } from '@/components/AI/ReliabilityContracts';
import { validateContentSyntax } from '@/components/AI/ChangeValidator';
import { askWebLLM, unloadAllWebLLMEngines } from '@/components/AI/WebLLMAPI';
import { AI_EVAL_CASES, QUALIFICATION_MODEL_IDS } from './cases';

const enabled = process.env.ZAKAMURAI_AI_QUALIFICATION === '1';
const recordOnly = process.env.ZAKAMURAI_AI_QUALIFICATION_RECORD_ONLY === '1';
const seeds = [101, 202, 303];
const qualificationProfile = {
  browser: process.env.ZAKAMURAI_AI_BROWSER_PROFILE || '',
  hardware: process.env.ZAKAMURAI_AI_HARDWARE_PROFILE || '',
};

const stripFence = (value: string): string =>
  value
    .replace(/^\s*```[^\n]*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();

describe('real WebGPU AI qualification matrix', () => {
  it('covers every model-facing case with three fixed seeds and every supported tier', () => {
    const modelFacing = AI_EVAL_CASES.filter((testCase) => testCase.modelFacing);
    expect(modelFacing).toHaveLength(22);
    expect(QUALIFICATION_MODEL_IDS).toHaveLength(4);
    expect(seeds).toHaveLength(3);
    expect(modelFacing.length * QUALIFICATION_MODEL_IDS.length * seeds.length).toBe(264);
  });

  it.skipIf(!enabled)(
    'qualifies the seeded model matrix against committed floors',
    async () => {
      if (!qualificationProfile.browser || !qualificationProfile.hardware) {
        throw new Error(
          'Set ZAKAMURAI_AI_BROWSER_PROFILE and ZAKAMURAI_AI_HARDWARE_PROFILE for release qualification.',
        );
      }
      const results = [];
      for (const modelId of QUALIFICATION_MODEL_IDS) {
        for (const seed of seeds) {
          for (const testCase of AI_EVAL_CASES.filter((item) => item.modelFacing)) {
            const expected = testCase.expected.requiredIncludes?.join(', ') || 'the request';
            const evidence = testCase.candidate.evidence || '';
            const taskKind =
              testCase.category === 'completion'
                ? 'completion'
                : testCase.category === 'explanation'
                  ? 'answer'
                  : 'write-file';
            const systemPrompt =
              taskKind === 'completion'
                ? COMPLETION_SYSTEM_PROMPT
                : taskKind === 'answer'
                  ? 'Answer concisely using only the supplied evidence. Do not invent file paths.'
                  : 'Return only complete JSX source for src/App.jsx. No prose or markdown.';
            const prompt =
              taskKind === 'answer'
                ? `${testCase.request}\n\nEvidence:\n${evidence}`
                : `${testCase.request}\nRequired observable content: ${expected}`;
            const startedAt = Date.now();
            let memoryMB: number | undefined;
            let fallbackCount = 0;
            const output = await askWebLLM(prompt, systemPrompt, null, {
              model: modelId,
              seed,
              taskKind,
              attempt: 1,
              responseFormat: responseFormatForTask(taskKind),
              requestKind: taskKind === 'completion' ? 'completion' : 'agent',
              temperature: taskKind === 'completion' ? 0.1 : 0.05,
              top_p: 0.8,
              max_tokens: taskKind === 'completion' ? 128 : taskKind === 'answer' ? 256 : 1800,
              contextWindowSize: taskKind === 'completion' ? 1024 : 4096,
              onMetrics: (metrics) => {
                memoryMB = Math.max(
                  memoryMB || 0,
                  metrics.jsHeapUsedMBAtStart || 0,
                  metrics.jsHeapUsedMBAtEnd || 0,
                );
                fallbackCount = metrics.recoveryCount;
              },
            });
            const source = stripFence(output);
            const syntaxError =
              taskKind === 'write-file' ? validateContentSyntax('src/App.jsx', source) : null;
            const candidate =
              taskKind === 'completion'
                ? { completion: output, latencyMs: Date.now() - startedAt, memoryMB, fallbackCount }
                : taskKind === 'answer'
                  ? {
                      answer: output,
                      evidence,
                      latencyMs: Date.now() - startedAt,
                      memoryMB,
                      fallbackCount,
                    }
                  : {
                      changes: [{ path: 'src/App.jsx', content: source }],
                      buildStatus: syntaxError ? ('failed' as const) : ('passed' as const),
                      previewStatus:
                        /<(?:main|section|article)\b/i.test(source) && /<h[1-6]\b/i.test(source)
                          ? ('passed' as const)
                          : ('failed' as const),
                      mutatedInput: false,
                      latencyMs: Date.now() - startedAt,
                      memoryMB,
                      fallbackCount,
                    };
            results.push(scoreAIEvalCase({ ...testCase, candidate }, modelId, seed));
          }
        }
        await unloadAllWebLLMEngines();
      }
      const reportPath = process.env.ZAKAMURAI_AI_QUALIFICATION_REPORT;
      if (reportPath) {
        await writeFile(
          resolve(reportPath),
          `${JSON.stringify({ version: 1, profile: qualificationProfile, results }, null, 2)}\n`,
        );
      }
      const matchingBaseline = matchingQualificationBaseline(
        baseline as AIEvalBaseline,
        qualificationProfile,
      );
      if (!matchingBaseline) {
        if (recordOnly && reportPath) return;
        throw new Error(
          'No matching model/browser/hardware baseline. Collect three reports and run update:ai-eval-baseline.',
        );
      }
      expect(compareAIEvalResults(results, matchingBaseline)).toEqual([]);
    },
    3_600_000,
  );
});
