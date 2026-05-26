import { findNavigationTargets } from '@/utils/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHighlightBreakdown, highlightCode } from './highlighter';

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
    hlComment: 'hlComment',
    hlFunc: 'hlFunc',
    hlTag: 'hlTag',
    hlAttr: 'hlAttr',
    hlProp: 'hlProp',
    hlMatch: 'hlMatch',
    hlMatchActive: 'hlMatchActive',
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

  it('reports JavaScript tokens that match rendered highlight classes', () => {
    const code = 'export const answer = 42;';
    const result = highlightCode(code, 'src/test.js', {}, styles, false, '', -1, '');
    const breakdown = getHighlightBreakdown({ code, filePath: 'src/test.js', state: {}, styles });

    expect(result).toContain('class="hlKw"');
    expect(result).toContain('class="hlNum"');
    expect(breakdown.languageMode).toBe('javascript');
    expect(
      breakdown.tokens.some((token) => token.type === 'hlKw' && token.value === 'export'),
    ).toBe(true);
    expect(breakdown.tokens.some((token) => token.type === 'hlNum' && token.value === '42')).toBe(
      true,
    );
  });

  it('reports CSS tokens that match rendered highlight classes', () => {
    const code = '.card { color: #fff; margin: 12px; }';
    const result = highlightCode(code, 'src/test.css', {}, styles, false, '', -1, '');
    const breakdown = getHighlightBreakdown({ code, filePath: 'src/test.css', state: {}, styles });

    expect(result).toContain('class="hlProp"');
    expect(result).toContain('class="hlNum"');
    expect(breakdown.languageMode).toBe('css');
    expect(
      breakdown.tokens.some((token) => token.type === 'hlProp' && token.value === 'color'),
    ).toBe(true);
  });

  it('reports JSON tokens that match rendered highlight classes', () => {
    const code = '{ "enabled": true }';
    const result = highlightCode(code, 'settings.json', {}, styles, false, '', -1, '');
    const breakdown = getHighlightBreakdown({ code, filePath: 'settings.json', state: {}, styles });

    expect(result).toContain('class="hlJsonKey"');
    expect(result).toContain('class="hlJsonBool"');
    expect(breakdown.languageMode).toBe('json');
    expect(
      breakdown.tokens.some((token) => token.type === 'hlJsonKey' && token.value === '"enabled"'),
    ).toBe(true);
  });

  it('reports template literal and HTML-like tokens from the same pipeline', () => {
    const code = 'const html = `<section id="a">${value}</section>`;';
    const result = highlightCode(code, 'src/test.jsx', {}, styles, false, '', -1, '');
    const breakdown = getHighlightBreakdown({ code, filePath: 'src/test.jsx', state: {}, styles });

    expect(result).toContain('class="hlStr"');
    expect(breakdown.tokens.some((token) => token.type === 'hlStr')).toBe(true);
    expect(breakdown.tokens.some((token) => token.value.includes('section'))).toBe(true);
  });

  it('does not treat single quotes inside comments as strings', () => {
    const code = `// This hasn't been intercepted yet\nconst x = 'real string';`;
    const result = highlightCode(code, 'src/test.js', {}, styles, false, '', -1, '');
    const breakdown = getHighlightBreakdown({ code, filePath: 'src/test.js', state: {}, styles });

    // The comment itself should be highlighted as hlComment, not contain hlStr
    expect(result).toContain('class="hlComment"');

    // There should only be one hlStr token (for 'real string') and none starting with "'t"
    const hlStrTokens = breakdown.tokens.filter((token) => token.type === 'hlStr');
    expect(hlStrTokens.length).toBe(1);
    expect(hlStrTokens[0].value).toBe("'real string'");
  });
});
