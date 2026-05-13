import { describe, expect, it, vi } from 'vitest';
import { highlightCode } from './highlighter';

describe('highlighter', () => {
  const styles = {
    'hl-kw': 'hl-kw',
    hlGhost: 'hlGhost',
    tabHint: 'tabHint',
  };

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
});
