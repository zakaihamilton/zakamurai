import { computeDiff } from '@/components/AI/Processor/utils/DiffEngine';
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
        targets: [{ filePath: 'src/test.js', fileName: 'test.js', loc: { line: 1, col: 7 } }],
      },
      {
        start: 121,
        end: 138,
        type: 'variable',
        name: 'generationOptions',
        targets: [{ filePath: 'src/test.js', fileName: 'test.js', loc: { line: 2, col: 7 } }],
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
    const state = {
      pendingDiffs: { 'src/AnimatedCard.jsx': { originalContent: original, diffs } },
    };

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
      { start: 20, end: 34, type: 'import', name: './styles.css', targets: [] },
    ]);
    const state = {
      fileContents: { 'src/Card.jsx': updated },
      pendingDiffs: { 'src/Card.jsx': { originalContent: original, diffs } },
    };

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
    const state = {
      pendingDiffs: {
        'src/file.js': { originalContent: original, diffs: computeDiff(original, updated).diffs },
      },
    };

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
        targets: [{ filePath: 'src/styles.css', fileName: 'styles.css', loc: { line: 1, col: 1 } }],
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
});
