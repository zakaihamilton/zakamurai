import { describe, expect, it } from 'vitest';
import {
  isEligibleProjectCheck,
  listProjectChecks,
  runProjectCheck,
  unavailableProjectCheck,
} from './ProjectChecks';

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

  it('handles malformed manifests and unavailable or invalid checks', async () => {
    expect(listProjectChecks({ 'package.json': '{bad json' })).toEqual([]);
    expect(listProjectChecks({ 'package.json': '{}' })).toEqual([]);
    expect(isEligibleProjectCheck('', 'vitest run')).toBe(false);
    expect(isEligibleProjectCheck('test', null)).toBe(false);
    expect(isEligibleProjectCheck('test', 'echo "unterminated')).toBe(false);

    await expect(runProjectCheck({ check: 'missing', files, run: async () => '' })).rejects.toThrow(
      'Project check is not eligible: missing',
    );
    expect(await runProjectCheck({ check: 'test', files })).toEqual(
      unavailableProjectCheck('test'),
    );

    const clipped = await runProjectCheck({
      check: 'test',
      files,
      run: async () => 'x'.repeat(12001),
    });
    expect(clipped.output?.endsWith('…[truncated]')).toBe(true);

    const empty = await runProjectCheck({ check: 'test', files, run: async () => '' });
    expect(empty.output).toBe('');
    const stringFailure = await runProjectCheck({
      check: 'test',
      files,
      run: async () => Promise.reject('failed as text'),
    });
    expect(stringFailure.diagnostics).toBe('failed as text');
  });
});
