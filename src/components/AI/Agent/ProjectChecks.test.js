import { describe, expect, it } from 'vitest';
import { isEligibleProjectCheck, listProjectChecks, runProjectCheck } from './ProjectChecks';

describe('project checks', () => {
  const files = {
    'package.json': JSON.stringify({
      scripts: {
        test: 'vitest run',
        lint: 'biome lint .',
        dev: 'next dev',
        format: 'biome format --write .',
      },
    }),
  };

  it('exposes only parsed, non-mutating declared scripts', () => {
    expect(listProjectChecks(files)).toEqual(['lint', 'test']);
    expect(isEligibleProjectCheck('test', 'vitest run && echo done')).toBe(true);
    expect(isEligibleProjectCheck('test', 'vitest run | tee out')).toBe(false);
  });

  it('bounds check output and reports failures structurally', async () => {
    const passed = await runProjectCheck({ check: 'test', files, run: async () => 'ok' });
    expect(passed.status).toBe('passed');
    const failed = await runProjectCheck({
      check: 'test',
      files,
      run: async () => {
        throw new Error('broken');
      },
    });
    expect(failed).toMatchObject({ status: 'failed', diagnostics: 'broken' });
  });
});
