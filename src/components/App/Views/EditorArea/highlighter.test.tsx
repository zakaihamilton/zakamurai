import { computeDiff } from '@/components/AI/Processor/utils/DiffEngine';
import { createMockHighlightState, createMockNavigationTarget } from '@/test-utils/editorMocks';
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
    hlVal: 'hlVal',
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
        targets: [
          {
            filePath: 'src/styles.css',
            fileName: 'styles.css',
            loc: { line: 1, col: 1, index: 0 },
          },
        ],
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

  it('wraps variable targets inside object literal arguments', () => {
    const code = [
      'const messages = [];',
      'const generationOptions = {};',
      'const reply = await engine.chat.completions.create({',
      '  messages,',
      '  ...generationOptions,',
      '});',
    ].join('\n');
    const mockTargets = [
      {
        start: 106,
        end: 114,
        type: 'variable',
        name: 'messages',
        targets: [
          { filePath: 'src/test.js', fileName: 'test.js', loc: { line: 1, col: 7, index: 0 } },
        ],
      },
      {
        start: 121,
        end: 138,
        type: 'variable',
        name: 'generationOptions',
        targets: [
          { filePath: 'src/test.js', fileName: 'test.js', loc: { line: 2, col: 7, index: 0 } },
        ],
      },
    ];
    vi.mocked(findNavigationTargets).mockReturnValue(mockTargets);

    const result = highlightCode(
      code,
      'src/test.js',
      {},
      styles,
      false,
      '',
      -1,
      undefined,
      undefined,
      true,
    );

    expect(result).toContain('data-nav-idx="0">messages</span>');
    expect(result).toContain(
      '...<span class="navLink" data-nav-target="true" data-nav-idx="1">generationOptions</span>',
    );
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

  it('closes multiline token spans before line row boundaries', () => {
    const result = highlightCode('/**\n * docs\n */\nconst value = 1;', 'src/test.js', {}, styles);

    expect(result).toContain(
      '<span class="lineRow " data-line="1" style="display: block;"><span class="hlComment">/**</span></span>',
    );
    expect(result).toContain(
      '<span class="lineRow " data-line="2" style="display: block;"><span class="hlComment"> * docs</span></span>',
    );
    expect(result).toContain(
      '<span class="lineRow " data-line="3" style="display: block;"><span class="hlComment"> */</span></span>',
    );
  });

  it('uses cache for identical content and parameters', () => {
    const code = 'const x = 10;';
    const state = { pendingDiffs: {}, selectedLines: {} };
    const result1 = highlightCode(code, 'test.js', state, styles, false, '', -1, '');
    const result2 = highlightCode(code, 'test.js', state, styles, false, '', -1, '');

    expect(result1).toBe(result2);
  });

  it('defers syntax highlighting for very large files', () => {
    const code = 'x'.repeat(250_001);
    const result = highlightCode(code, 'src/large.js', {}, styles);

    expect(result).toBe(code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    expect(result).not.toContain('class="hlKw"');
  });

  it('returns an empty string for empty code input', () => {
    expect(highlightCode('', 'src/test.js', {}, styles)).toBe('');
    expect(getHighlightBreakdown({ code: '', filePath: 'src/test.js', styles }).sourceLength).toBe(
      0,
    );
  });

  it('invalidates cache when pending diffs are present', () => {
    const code = 'const x = 10;';
    const withoutDiffs = highlightCode(code, 'src/test.js', { pendingDiffs: {} }, styles);
    const withDiffs = highlightCode(
      code,
      'src/test.js',
      {
        pendingDiffs: {
          'src/test.js': {
            originalContent: code,
            modifiedContent: 'const x = 20;',
            diffs: computeDiff(code, 'const x = 20;').diffs,
          },
        },
      },
      { ...styles, diffHighlight: 'diffHighlight' },
    );

    expect(withoutDiffs).not.toBe(withDiffs);
  });

  it('invalidates cache when find query changes', () => {
    const code = 'alpha beta alpha';
    const result1 = highlightCode(code, 'test.js', {}, styles, true, 'alpha', 0);
    const result2 = highlightCode(code, 'test.js', {}, styles, true, 'beta', 0);
    expect(result1).not.toEqual(result2);
  });

  it('highlights selected line rows', () => {
    const code = 'const first = 1;\nconst second = 2;';
    const state = { selectedLines: { 'src/test.js': [2] } };
    const result = highlightCode(code, 'src/test.js', state, {
      ...styles,
      selectedLineRow: 'selectedLineRow',
      lineRow: 'lineRow',
    });

    expect(result).toContain('class="lineRow selectedLineRow" data-line="2"');
    expect(result).toContain('class="lineRow " data-line="1"');
  });

  it('highlights find query matches and marks the active match', () => {
    const code = 'alpha beta alpha';
    const result = highlightCode(code, 'src/test.js', {}, styles, true, 'alpha', 1);
    const breakdown = getHighlightBreakdown({
      code,
      filePath: 'src/test.js',
      styles,
      showFind: true,
      findQuery: 'alpha',
      matchIndex: 1,
    });

    expect(breakdown.search.matchCount).toBe(2);
    expect(result).toContain('class="hlMatchActive"');
  });

  it('invalidates cache when selectedLines change', () => {
    const code = 'const x = 10;';
    const result1 = highlightCode(code, 'test.js', { selectedLines: { 'test.js': [1] } }, styles);
    const result2 = highlightCode(code, 'test.js', { selectedLines: { 'test.js': [2] } }, styles);

    expect(result1).not.toBe(result2);
  });

  it('invalidates cache when cursorPos changes', () => {
    const code = 'const value = 1;';
    const result1 = highlightCode(code, 'test.js', {}, styles, false, '', -1, 'foo', { index: 6 });
    const result2 = highlightCode(code, 'test.js', {}, styles, false, '', -1, 'foo', { index: 12 });

    expect(result1).not.toBe(result2);
  });

  it('invalidates cache when code changes', () => {
    const state = { pendingDiffs: {}, selectedLines: {} };
    const result1 = highlightCode('const x = 10;', 'test.js', state, styles, false, '', -1, '');
    const result2 = highlightCode('const x = 20;', 'test.js', state, styles, false, '', -1, '');

    expect(result1).not.toBe(result2);
  });

  it('does not mark unchanged closing tags as removed on the original pane', () => {
    const original = [
      '      <ul className={styles.features}>',
      '        <li>CSS Module Support</li>',
      '        <li>Responsive Design</li>',
      '      </ul>',
      '    </div>',
    ].join('\n');
    const updated = [
      '      <ul className={styles.features}>',
      '        <li>CSS Module Support</li>',
      '        <li>Responsive Design</li>',
      '        <li>Accessibility Compliant</li>',
      '        <li>Cross-Browser Compatible</li>',
      '        <li>Performance Optimized</li>',
      '        <li>SEO Friendly</li>',
      '      </ul>',
      '    </div>',
    ].join('\n');
    const diffs = computeDiff(original, updated).diffs;
    const state = createMockHighlightState({
      pendingDiffs: {
        'src/AnimatedCard.jsx': {
          originalContent: original,
          modifiedContent: updated,
          diffs,
        },
      },
    });

    const originalResult = highlightCode(
      original,
      'src/AnimatedCard.jsx',
      state,
      { ...styles, diffHighlight: 'diffHighlight', diffDeleteHighlight: 'diffDeleteHighlight' },
      false,
      '',
      -1,
      undefined,
      undefined,
      false,
      true,
    );
    const modifiedResult = highlightCode(
      updated,
      'src/AnimatedCard.jsx',
      state,
      { ...styles, diffHighlight: 'diffHighlight', diffDeleteHighlight: 'diffDeleteHighlight' },
      false,
      '',
      -1,
      undefined,
      undefined,
      false,
      false,
    );

    expect(diffs[0]?.original).toBe('');
    expect(originalResult).not.toContain('diffDeleteHighlight');
    expect(modifiedResult.match(/class="diffHighlight"/g)).toHaveLength(4);
  });

  it('highlights appended JSX list items when navigation markers are present', () => {
    const original = [
      'import styles from "./styles.css";',
      '<ul>',
      '  <li>CSS Module Support</li>',
      '  <li>Responsive Design</li>',
      '</ul>',
    ].join('\n');
    const updated = [
      'import styles from "./styles.css";',
      '<ul>',
      '  <li>CSS Module Support</li>',
      '  <li>Responsive Design</li>',
      '  <li>Accessibility Compliant</li>',
      '  <li>Cross-Browser Compatible</li>',
      '  <li>Performance Optimized</li>',
      '  <li>SEO Friendly</li>',
      '</ul>',
    ].join('\n');
    const diffs = computeDiff(original, updated).diffs;
    vi.mocked(findNavigationTargets).mockReturnValue([
      createMockNavigationTarget({
        start: 20,
        end: 34,
        type: 'import',
        name: './styles.css',
        targets: [],
      }),
    ]);
    const state = createMockHighlightState({
      fileContents: { 'src/Card.jsx': updated },
      pendingDiffs: {
        'src/Card.jsx': { originalContent: original, modifiedContent: updated, diffs },
      },
    });

    const result = highlightCode(
      updated,
      'src/Card.jsx',
      state,
      { ...styles, diffHighlight: 'diffHighlight' },
      false,
      '',
      -1,
      undefined,
      undefined,
      true,
    );

    expect(result.match(/class="diffHighlight"/g)).toHaveLength(4);
    expect(result.indexOf('Accessibility Compliant')).toBeGreaterThan(
      result.indexOf('diffHighlight'),
    );
    expect(result.lastIndexOf('diffHighlight')).toBeLessThan(result.indexOf('SEO Friendly'));
    expect(result.indexOf('diffHighlight')).toBeGreaterThan(result.indexOf('Responsive Design'));
  });

  it('does not render multiline tooltip content as duplicate code lines', () => {
    const original = ['const old = 1;', 'const second = 2;', 'const third = 3;'].join('\n');
    const updated = ['const replacement = 4;', 'const finalValue = 5;'].join('\n');
    const state = createMockHighlightState({
      pendingDiffs: {
        'src/file.js': {
          originalContent: original,
          modifiedContent: updated,
          diffs: computeDiff(original, updated).diffs,
        },
      },
    });

    const result = highlightCode(updated, 'src/file.js', state, {
      ...styles,
      diffHighlight: 'diffHighlight',
      lineRow: 'lineRow',
    });

    expect(result.match(/data-line=/g)).toHaveLength(2);
    expect(result).not.toContain('data-original');
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

  it('assigns source ranges to each token occurrence instead of using indexOf', () => {
    const code = [
      'const first = 1;',
      'const second = 2;',
      'function sample() {',
      '  return first + second;',
      '}',
    ].join('\n');
    const breakdown = getHighlightBreakdown({ code, filePath: 'src/test.js', state: {}, styles });
    const constTokens = breakdown.tokens.filter(
      (token) => token.type === 'hlKw' && token.value === 'const',
    );

    expect(constTokens).toHaveLength(2);
    expect(constTokens.map((token) => token.range?.start)).toEqual([0, 17]);
    expect(
      constTokens.every(
        (token) => token.range?.startPosition?.line === token.range?.endPosition?.line,
      ),
    ).toBe(true);
  });

  it('orders SearchReplaceParser tokens by source position', () => {
    const filePath = 'src/components/AI/Processor/utils/SearchReplaceParser.js';
    const code = [
      "import { someSymbol } from './Parser';",
      '',
      '',
      '',
      '',
      "const placeholder = '[exact existing lines]';",
      'const secondary = 123;',
    ].join('\n');
    const breakdown = getHighlightBreakdown({
      code,
      filePath,
      state: { fileContents: { [filePath]: code } },
      styles,
      navigationLinksEnabled: true,
    });
    const ordered = [...breakdown.tokens].sort((a, b) => {
      const aStart = a.range?.start ?? Number.POSITIVE_INFINITY;
      const bStart = b.range?.start ?? Number.POSITIVE_INFINITY;
      if (aStart !== bStart) return aStart - bStart;
      return a.index - b.index;
    });

    const importToken = ordered.find((token) => token.type === 'hlKw' && token.value === 'import');
    const firstPlaceholder = ordered.find(
      (token) => token.type === 'hlStr' && token.value === "'[exact existing lines]'",
    );

    expect(importToken?.range?.startPosition?.line).toBe(1);
    expect(firstPlaceholder?.range?.startPosition?.line).toBe(6);
    expect((importToken?.range?.start ?? 0) < (firstPlaceholder?.range?.start ?? 0)).toBe(true);

    const constTokens = ordered.filter((token) => token.type === 'hlKw' && token.value === 'const');
    expect(new Set(constTokens.map((token) => token.range?.start)).size).toBe(constTokens.length);
  });

  it('orders repeated tokens by their position in the file', () => {
    const code = 'const first = 1;\nconst second = 2;';
    const breakdown = getHighlightBreakdown({ code, filePath: 'src/test.js', state: {}, styles });
    const ordered = [...breakdown.tokens].sort((a, b) => {
      const aStart = a.range?.start ?? Number.POSITIVE_INFINITY;
      const bStart = b.range?.start ?? Number.POSITIVE_INFINITY;
      if (aStart !== bStart) return aStart - bStart;
      return a.index - b.index;
    });

    const firstConst = ordered.findIndex((token) => token.value === 'const');
    const secondConst = ordered.findIndex(
      (token, index) => index > firstConst && token.value === 'const',
    );
    expect(firstConst).toBeGreaterThanOrEqual(0);
    expect(secondConst).toBeGreaterThan(firstConst);
    expect(ordered[firstConst].range?.start).toBeLessThan(ordered[secondConst].range?.start ?? 0);
  });

  it('reports CSS tokens that match rendered highlight classes', () => {
    const code =
      '.card, .btn-primary { color: #fff; margin: 12px; border: 1px solid red; background: rgb(0, 0, 0); }';
    const result = highlightCode(code, 'src/test.css', {}, styles, false, '', -1, '');
    const breakdown = getHighlightBreakdown({ code, filePath: 'src/test.css', state: {}, styles });

    expect(result).toContain('class="hlProp"');
    expect(result).toContain('class="hlNum"');
    expect(result).toContain('class="hlVal"');
    expect(result).toContain('class="hlFunc"');
    expect(breakdown.languageMode).toBe('css');
    expect(
      breakdown.tokens.some((token) => token.type === 'hlTag' && token.value === '.card'),
    ).toBe(true);
    expect(
      breakdown.tokens.some((token) => token.type === 'hlTag' && token.value === '.btn-primary'),
    ).toBe(true);
    expect(
      breakdown.tokens.some((token) => token.type === 'hlProp' && token.value === 'color'),
    ).toBe(true);
    expect(
      breakdown.tokens.some((token) => token.type === 'hlVal' && token.value === 'solid'),
    ).toBe(true);
    expect(breakdown.tokens.some((token) => token.type === 'hlVal' && token.value === 'red')).toBe(
      true,
    );
    expect(breakdown.tokens.some((token) => token.type === 'hlFunc' && token.value === 'rgb')).toBe(
      true,
    );
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

  it('keeps template literal expressions available for JavaScript highlighting', () => {
    const code = 'console.warn(`Failed to check WebLLM cache for ${model.id}:`, error);';
    const result = highlightCode(code, 'src/test.js', {}, styles, false, '', -1, '');
    const breakdown = getHighlightBreakdown({ code, filePath: 'src/test.js', state: {}, styles });
    const strTokens = breakdown.tokens.filter((token) => token.type === 'hlStr');

    expect(result).toContain('class="hlFunc">warn</span>');
    expect(result).toContain('model.<span class="hlProp">id</span>');
    expect(strTokens.some((token) => token.value.includes('Failed to check WebLLM cache'))).toBe(
      true,
    );
    expect(strTokens.some((token) => token.value.includes('model.id'))).toBe(false);
  });

  it('highlights JavaScript object keys and member properties', () => {
    const code = `const messages = [
  { role: 'system', content: systemPrompt || defaultSystemPrompt },
  { role: 'user', content: prompt },
];
generationOptions.max_tokens = options.max_tokens;`;
    const result = highlightCode(code, 'src/test.js', {}, styles, false, '', -1, '');
    const breakdown = getHighlightBreakdown({ code, filePath: 'src/test.js', state: {}, styles });
    const propTokens = breakdown.tokens.filter((token) => token.type === 'hlProp');

    expect(result).toContain('class="hlProp">role</span>');
    expect(result).toContain('class="hlProp">content</span>');
    expect(result).toContain('class="hlProp">max_tokens</span>');
    expect(propTokens.some((token) => token.value === 'role')).toBe(true);
    expect(propTokens.some((token) => token.value === 'content')).toBe(true);
    expect(propTokens.some((token) => token.value === 'max_tokens')).toBe(true);
  });

  it('keeps called member names highlighted as functions', () => {
    const code = "console.warn('Failed:', error);";
    const result = highlightCode(code, 'src/test.js', {}, styles, false, '', -1, '');
    const breakdown = getHighlightBreakdown({ code, filePath: 'src/test.js', state: {}, styles });

    expect(result).toContain('class="hlFunc">warn</span>');
    expect(
      breakdown.tokens.some((token) => token.type === 'hlProp' && token.value === 'warn'),
    ).toBe(false);
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

  it('does not treat regex literals with internal slashes as comments', () => {
    const code = `const normalized = providedPath.replace(/^\\.\\//,'').replace(/\\/+/g, '/');`;
    const breakdown = getHighlightBreakdown({ code, filePath: 'src/test.js', state: {}, styles });

    // No token should be an hlComment — there are no real comments on this line
    const commentTokens = breakdown.tokens.filter((t) => t.type === 'hlComment');
    expect(commentTokens).toHaveLength(0);

    // The string '/' at the end should be present as hlStr
    const strTokens = breakdown.tokens.filter((t) => t.type === 'hlStr');
    expect(strTokens.some((t) => t.value === "'/'")).toBe(true);
  });

  it('correctly tokenizes CSS and ignores internal markers (navigation, diffs, suggestions)', () => {
    // This simulates having a navigation target at `.card`
    const code = '.card { color: red; }';
    const mockTargets = [
      {
        start: 0,
        end: 5,
        type: 'selector',
        name: '.card',
        targets: [
          {
            filePath: 'src/styles.css',
            fileName: 'styles.css',
            loc: { line: 1, col: 1, index: 0 },
          },
        ],
      },
    ];
    vi.mocked(findNavigationTargets).mockReturnValue(mockTargets);

    const breakdown = getHighlightBreakdown({
      code,
      filePath: 'src/styles.css',
      state: { fileContents: {} },
      styles,
      navigationLinksEnabled: true,
    });

    // It should NOT contain any token with value 'a'
    const aTokens = breakdown.tokens.filter((t) => t.value === 'a');
    expect(aTokens).toHaveLength(0);

    // It should have the correct selector token
    const selectorToken = breakdown.tokens.find((t) => t.type === 'hlTag' && t.value === '.card');
    expect(selectorToken).toBeDefined();

    // It should have the correct property token
    const propToken = breakdown.tokens.find((t) => t.type === 'hlProp' && t.value === 'color');
    expect(propToken).toBeDefined();
  });

  it('evicts the oldest cache entry after exceeding the cache size limit', () => {
    for (let i = 0; i < 52; i++) {
      highlightCode(`const value${i} = ${i};`, `cache-${i}.js`, {}, styles);
    }

    const first = highlightCode('const value0 = 0;', 'cache-0.js', {}, styles);
    const last = highlightCode('const value51 = 51;', 'cache-51.js', {}, styles);
    expect(first).toContain('hlKw');
    expect(last).toContain('hlKw');
  });

  it('uses the default diff delete class when styles omit diffDeleteHighlight', () => {
    const original = 'const old = 1;';
    const updated = 'const newer = 2;';
    const state = createMockHighlightState({
      pendingDiffs: {
        'src/file.js': {
          originalContent: original,
          modifiedContent: updated,
          diffs: computeDiff(original, updated).diffs,
        },
      },
    });

    const result = highlightCode(
      original,
      'src/file.js',
      state,
      { ...styles, diffHighlight: 'diffHighlight' },
      false,
      '',
      -1,
      undefined,
      undefined,
      false,
      true,
    );

    expect(result).toContain('class="diffDeleteHighlight"');
  });

  it('keeps diff spans open across wrapped line rows', () => {
    const original = 'const old = 1;\nconst kept = 2;';
    const updated = 'const replacement = 9;\nconst kept = 2;';
    const state = createMockHighlightState({
      pendingDiffs: {
        'src/file.js': {
          originalContent: original,
          modifiedContent: updated,
          diffs: computeDiff(original, updated).diffs,
        },
      },
    });

    const result = highlightCode(
      updated,
      'src/file.js',
      state,
      { ...styles, diffHighlight: 'diffHighlight' },
      false,
      '',
      -1,
      undefined,
      undefined,
      false,
      false,
    );

    expect(result).toContain('diffHighlight');
    expect(result.match(/data-line="/g)?.length).toBe(2);
  });

  it('highlights comparison operators without treating them as HTML', () => {
    const code = 'const valid = a < b && b > 0;';
    const breakdown = getHighlightBreakdown({ code, filePath: 'src/test.js', styles });
    expect(breakdown.tokens.some((token) => token.value.includes('<'))).toBe(false);
    expect(highlightCode(code, 'src/test.js', {}, styles)).toContain('&lt;');
  });

  it('defers analysis when line count exceeds the configured limit', () => {
    const code = `${'line\n'.repeat(2001)}end`;
    const breakdown = getHighlightBreakdown({ code, filePath: 'src/big.js', styles });
    expect(breakdown.largeFileFallback).toBe(true);
    expect(highlightCode(code, 'src/big.js', {}, styles)).not.toContain('class="hlKw"');
  });

  it('skips pure insertions on the original diff pane', () => {
    const original = 'const keep = 1;';
    const updated = 'const keep = 1;\nconst added = 2;';
    const diffs = computeDiff(original, updated).diffs;
    const state = createMockHighlightState({
      pendingDiffs: {
        'src/file.js': { originalContent: original, modifiedContent: updated, diffs },
      },
    });

    const result = highlightCode(
      original,
      'src/file.js',
      state,
      { ...styles, diffHighlight: 'diffHighlight', diffDeleteHighlight: 'diffDeleteHighlight' },
      false,
      '',
      -1,
      undefined,
      undefined,
      false,
      true,
    );

    expect(result).not.toContain('diffDeleteHighlight');
    expect(result).not.toContain('diffHighlight');
  });

  it('renders blank lines as a single space inside line rows', () => {
    const result = highlightCode('\n', 'src/blank.js', {}, { ...styles, lineRow: 'lineRow' });
    expect(result).toContain('> </span>');
  });

  it('caches repeated navigation-enabled highlights', () => {
    const code = "import './a.js';";
    vi.mocked(findNavigationTargets).mockReturnValue([
      createMockNavigationTarget({
        start: 8,
        end: 17,
        type: 'import',
        name: './a.js',
        targets: [],
      }),
    ]);
    const state = { fileContents: { 'src/a.js': 'content' } };
    const first = highlightCode(
      code,
      'src/App.js',
      state,
      styles,
      false,
      '',
      -1,
      undefined,
      undefined,
      true,
    );
    const second = highlightCode(
      code,
      'src/App.js',
      state,
      styles,
      false,
      '',
      -1,
      undefined,
      undefined,
      true,
    );
    expect(first).toBe(second);
    expect(first).toContain('navLink');
  });

  it('highlights CSS custom properties and functions', () => {
    const code = '.card { color: var(--primary); background: rgb(0, 0, 0); }';
    const result = highlightCode(code, 'src/theme.css', {}, styles);
    const breakdown = getHighlightBreakdown({ code, filePath: 'src/theme.css', styles });

    expect(result).toContain('class="hlFunc">var</span>');
    expect(result).toContain('class="hlVal">--primary</span>');
    expect(breakdown.tokens.some((token) => token.type === 'hlFunc' && token.value === 'var')).toBe(
      true,
    );
  });

  it('reports search metadata when find mode is enabled without a query', () => {
    const breakdown = getHighlightBreakdown({
      code: 'alpha beta',
      filePath: 'src/test.js',
      styles,
      showFind: true,
      findQuery: '',
    });
    expect(breakdown.search.enabled).toBe(false);
    expect(breakdown.search.matchCount).toBe(0);
  });

  it('includes suggestion metadata in debug breakdown when cursor position is provided', () => {
    const breakdown = getHighlightBreakdown({
      code: 'const value = 1;',
      filePath: 'src/test.js',
      styles,
      suggestion: 'next',
      cursorPos: { line: 1, col: 16, index: 15 },
    });
    expect(breakdown.suggestion?.text).toBe('next');
    expect(breakdown.suggestion?.cursorPosition?.line).toBe(1);
  });

  it('highlights regex literals and block comments in JavaScript', () => {
    const code = 'const pattern = /\\{not-a-comment\\}/; /* block */';
    const breakdown = getHighlightBreakdown({ code, filePath: 'src/test.js', styles });
    expect(breakdown.tokens.some((token) => token.type === 'hlComment')).toBe(true);
    expect(breakdown.tokens.some((token) => token.type === 'hlStr')).toBe(true);
  });

  it('highlights JSX attributes and tag names', () => {
    const code = '<section className="card">text</section>';
    const result = highlightCode(code, 'src/Card.jsx', {}, styles);
    expect(result).toContain('class="hlAttr">className</span>');
    expect(result).toContain('class="hlTag">section</span>');
  });

  it('highlights HTML files with tag and attribute classes', () => {
    const code = '<main data-test="app"><p>Hello</p></main>';
    const result = highlightCode(code, 'public/index.html', {}, styles);
    expect(result).toContain('class="hlTag">main</span>');
    expect(result).toContain('class="hlAttr">data-test</span>');
  });

  it('uses original diff coordinates on the original pane', () => {
    const original = 'const old = 1;';
    const updated = 'const newer = 2;';
    const diffs = computeDiff(original, updated).diffs;
    const state = createMockHighlightState({
      pendingDiffs: {
        'src/file.js': { originalContent: original, modifiedContent: updated, diffs },
      },
    });
    const result = highlightCode(
      original,
      'src/file.js',
      state,
      { ...styles, diffHighlight: 'diffHighlight', diffDeleteHighlight: 'diffDeleteHighlight' },
      false,
      '',
      -1,
      undefined,
      undefined,
      false,
      true,
    );
    expect(result).toContain('diffDeleteHighlight');
  });

  it('highlights active find matches separately from passive matches', () => {
    const code = 'find find find';
    const result = highlightCode(code, 'src/test.js', {}, styles, true, 'find', 1);
    expect(result).toContain('hlMatchActive');
    expect(result).toContain('hlMatch');
  });

  it('falls back to default stylesheet modules when styles are omitted', () => {
    const result = highlightCode('const value = 1;', 'src/test.js', {}, undefined);
    expect(result).toContain('class="');
  });
});
