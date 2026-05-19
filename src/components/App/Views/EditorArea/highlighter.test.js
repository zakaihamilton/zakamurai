import { findNavigationTargets } from '@/utils/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { highlightCode } from './highlighter';

vi.mock('@/utils/navigation', () => ({
  findNavigationTargets: vi.fn(() => []),
}));

describe('highlighter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const styles = {
    hlKw: 'hlKw',
    hlStr: 'hlStr',
    hlNum: 'hlNum',
    hlJsonKey: 'hlJsonKey',
    hlJsonBool: 'hlJsonBool',
    hlJsonPunc: 'hlJsonPunc',
    hlGhost: 'hlGhost',
    tabHint: 'tabHint',
    navLink: 'navLink',
  };

  it('wraps targets in navLink class in readOnly mode', () => {
    const code = "import './styles.css';";
    const state = { fileContents: {} };
    const mockTargets = [
      {
        start: 7,
        end: 21,
        type: 'import',
        name: './styles.css',
        targets: [{ filePath: 'src/styles.css', fileName: 'styles.css', loc: { line: 1, col: 1 } }],
      },
    ];
    vi.mocked(findNavigationTargets).mockReturnValue(mockTargets);

    const result = highlightCode(
      code,
      'src/App.js',
      state,
      styles,
      false,
      '',
      -1,
      undefined,
      undefined,
      true, // isReadOnly
    );

    expect(findNavigationTargets).toHaveBeenCalledWith(code, false, {}, 'src/App.js');
    expect(result).toContain('class="navLink"');
    expect(result).toContain('data-nav-target="true"');
    expect(result).toContain('data-nav-idx="0"');
    expect(result).toContain('styles.css');
  });

  it('injects ghost text at the suggestion marker', () => {
    // \u0005 is the suggestion marker
    const code = 'const x = \u0005;';
    const suggestion = '10';
    const result = highlightCode(code, 'javascript', {}, styles, false, '', -1, suggestion);

    expect(result).toContain('hlGhost');
    expect(result).toContain('10');
    expect(result).toContain('Press <kbd>Tab</kbd>');
  });

  it('handles undefined suggestion gracefully', () => {
    const code = 'const x = \u0005;';
    const result = highlightCode(code, 'javascript', {}, styles, false, '', -1, undefined);

    expect(result).toContain('hlGhost');
    // Should be empty span content
    expect(result).toContain('"></span>');
  });

  it('escapes ghost text so completions match editor text safely', () => {
    const result = highlightCode('return \u0005', 'javascript', {}, styles, false, '', -1, '<div>');

    expect(result).toContain('&lt;div&gt;');
    expect(result).not.toContain('<div>');
  });

  it('uses cache for identical content and parameters', () => {
    const code = 'const x = 10;';
    const state = { pendingDiffs: {}, selectedLines: {} };
    const result1 = highlightCode(code, 'test.js', state, styles, false, '', -1, '');
    const result2 = highlightCode(code, 'test.js', state, styles, false, '', -1, '');

    expect(result1).toBe(result2);
  });

  it('invalidates cache when code changes', () => {
    const state = { pendingDiffs: {}, selectedLines: {} };
    const result1 = highlightCode('const x = 10;', 'test.js', state, styles, false, '', -1, '');
    const result2 = highlightCode('const x = 20;', 'test.js', state, styles, false, '', -1, '');

    expect(result1).not.toBe(result2);
  });

  it('invalidates cache when filePath changes to a different language', () => {
    const code = 'body { color: red; }';
    const state = { pendingDiffs: {}, selectedLines: {} };
    const result1 = highlightCode(code, 'styles.css', state, styles, false, '', -1, '');
    const result2 = highlightCode(code, 'script.js', state, styles, false, '', -1, '');

    expect(result1).not.toBe(result2);
  });

  it('uses JSON-specific classes for keys, literals, numbers, and punctuation', () => {
    const code = '{ "enabled": true, "count": -12.5, "name": "Zaka" }';
    const result = highlightCode(code, 'settings.json', {}, styles, false, '', -1, '');

    expect(result).toContain('class="hlJsonKey"');
    expect(result).toContain('class="hlJsonBool"');
    expect(result).toContain('class="hlNum"');
    expect(result).toContain('class="hlStr"');
    expect(result).toContain('class="hlJsonPunc"');
  });
});
