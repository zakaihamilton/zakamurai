import { describe, expect, it } from 'vitest';
import { parseLocalAIBenchmarkArgs } from '../../scripts/ai-bench-cli';

describe('local AI benchmark CLI arguments', () => {
  it('accepts a model and case filter', () => {
    expect(
      parseLocalAIBenchmarkArgs([
        '--model',
        'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
        '--case',
        'todo',
      ]),
    ).toEqual({
      modelId: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
      caseId: 'todo',
      help: false,
    });
  });

  it('accepts help without requiring a model or case', () => {
    expect(parseLocalAIBenchmarkArgs(['--', '--help'])).toEqual({ help: true });
  });

  it('rejects missing values and unknown options', () => {
    expect(() => parseLocalAIBenchmarkArgs(['--case'])).toThrow('--case requires a value');
    expect(() => parseLocalAIBenchmarkArgs(['--no-ci'])).toThrow('Unknown argument: --no-ci');
  });
});
