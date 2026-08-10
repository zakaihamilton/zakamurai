import baseline from './baseline.json';
import { describe, expect, it } from 'vitest';
import {
  type AIEvalBaseline,
  compareAIEvalResults,
  qualificationProfileMatches,
  scoreAIEvalCase,
} from '@/components/AI/AIEvals';
import { AI_EVAL_CASES, QUALIFICATION_MODEL_IDS } from './cases';

describe('versioned AI reliability evaluations', () => {
  it('contains the required category matrix', () => {
    const counts = Object.fromEntries(
      ['agent', 'completion', 'explanation', 'lifecycle', 'recovery'].map((category) => [
        category,
        AI_EVAL_CASES.filter((testCase) => testCase.category === category).length,
      ]),
    );
    expect(counts).toEqual({
      agent: 12,
      completion: 6,
      explanation: 4,
      lifecycle: 4,
      recovery: 4,
    });
    expect(new Set(AI_EVAL_CASES.map((testCase) => testCase.id)).size).toBe(30);
  });

  it('passes every deterministic hard gate and the committed model floors', () => {
    const results = AI_EVAL_CASES.flatMap((testCase) =>
      QUALIFICATION_MODEL_IDS.map((modelId) => scoreAIEvalCase(testCase, modelId)),
    );
    expect(results.every((result) => result.hardPass)).toBe(true);
    expect(compareAIEvalResults(results, baseline as AIEvalBaseline)).toEqual([]);
  });

  it('detects unsafe changes, ungrounded answers, and lifecycle regressions', () => {
    const explanationCase = AI_EVAL_CASES.find((testCase) => testCase.category === 'explanation');
    const lifecycleCase = AI_EVAL_CASES.find((testCase) => testCase.category === 'lifecycle');
    if (!explanationCase || !lifecycleCase) throw new Error('Evaluation fixtures are incomplete.');
    const unsafe = {
      ...AI_EVAL_CASES[0],
      candidate: { changes: [{ path: '../secret', content: 'stolen' }] },
    };
    const ungrounded = {
      ...explanationCase,
      candidate: { answer: 'src/Invented.ts controls this.', evidence: 'src/App.jsx' },
    };
    const lifecycle = {
      ...lifecycleCase,
      candidate: { events: ['initializing', 'failed'] },
    };
    expect(scoreAIEvalCase(unsafe, QUALIFICATION_MODEL_IDS[0]).hardPass).toBe(false);
    expect(scoreAIEvalCase(ungrounded, QUALIFICATION_MODEL_IDS[0]).hardPass).toBe(false);
    expect(scoreAIEvalCase(lifecycle, QUALIFICATION_MODEL_IDS[0]).hardPass).toBe(false);
  });

  it('rejects newly failing hard cases and mismatched qualification profiles', () => {
    const result = scoreAIEvalCase(AI_EVAL_CASES[0], QUALIFICATION_MODEL_IDS[0]);
    const tracked = {
      ...(baseline as AIEvalBaseline),
      caseHardPass: { [`${result.modelId}::${result.caseId}`]: true },
      qualificationBaselines: [
        {
          profile: { browser: 'Chrome 140', hardware: 'Example GPU' },
          caseHardPass: {},
          models: {},
        },
      ],
    };
    expect(compareAIEvalResults([{ ...result, hardPass: false }], tracked)).toContain(
      `${result.modelId}/${result.caseId}: newly failing hard case.`,
    );
    expect(
      qualificationProfileMatches(tracked, {
        browser: 'Chrome 140',
        hardware: 'Different GPU',
      }),
    ).toBe(false);
  });
});
