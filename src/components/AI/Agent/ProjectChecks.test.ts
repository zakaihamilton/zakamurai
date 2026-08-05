import { describe, expect, it } from 'vitest';
import {
  checkComponentModularity,
  isEligibleProjectCheck,
  listProjectChecks,
  runProjectCheck,
  selectProjectCheck,
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

  it('selects the check relevant to the request instead of always using the first one', () => {
    expect(selectProjectCheck('fix the failing tests', ['lint', 'test'])).toBe('test');
    expect(selectProjectCheck('build the app', ['lint', 'build'])).toBe('build');
    expect(selectProjectCheck('run a check', ['lint', 'test'])).toBe('lint');
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

  it('checks component modularity and CSS module co-location', () => {
    // Case 1: Monolithic App.jsx without subcomponents
    const monolithic = {
      'src/App.jsx': '// line\n'.repeat(160),
    };
    const monoResult = checkComponentModularity(monolithic);
    expect(monoResult.passed).toBe(false);
    expect(monoResult.errors[0]).toContain('Monolithic src/App.jsx detected');

    // Case 2: Subcomponent without CSS module
    const missingCss = {
      'src/App.jsx': 'import Header from "./components/Header";',
      'src/components/Header.jsx': 'export default function Header() { return <header />; }',
    };
    const missingResult = checkComponentModularity(missingCss);
    expect(missingResult.passed).toBe(false);
    expect(missingResult.errors[0]).toContain('Header.jsx lacks a co-located *.module.css');

    // Case 3: Proper modular components with CSS module
    const validModular = {
      'src/App.jsx': 'import Header from "./components/Header";',
      'src/components/Header.jsx':
        "import styles from './Header.module.css'; export default function Header() { return <header className={styles.header} />; }",
      'src/components/Header.module.css': '.header { background: red; }',
    };
    const validResult = checkComponentModularity(validModular);
    expect(validResult.passed).toBe(true);
    expect(validResult.errors).toHaveLength(0);
  });
});
