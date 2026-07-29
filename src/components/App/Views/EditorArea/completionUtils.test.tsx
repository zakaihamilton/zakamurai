import { describe, expect, it } from 'vitest';
import {
  buildCompletionPrompt,
  buildCompletionRagQuery,
  getCompletionActivityMessage,
  getCompletionStatusMessage,
  getNextSuggestionWord,
  normalizeCompletion,
  normalizeStreamingCompletion,
} from './completionUtils';

describe('completionUtils', () => {
  describe('normalizeCompletion', () => {
    it('extracts content from completion tags', () => {
      expect(normalizeCompletion('<completion>const x = 1;</completion>', '', '')).toBe(
        'const x = 1;',
      );
    });

    it('strips redacted thinking blocks', () => {
      const raw = '<think>secret</think>\nconst x = 1;';
      expect(normalizeCompletion(raw, '', '')).toBe('const x = 1;');
    });

    it('strips markdown code fences', () => {
      const raw = '```js\nconst x = 1;\n```';
      expect(normalizeCompletion(raw, '', '')).toBe('const x = 1;');
    });

    it('returns empty string when over char limit', () => {
      const long = 'x'.repeat(501);
      expect(normalizeCompletion(long, '', '')).toBe('');
    });

    it('limits to max completion lines', () => {
      const lines = Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n');
      const result = normalizeCompletion(lines, '', '');
      expect(result.split('\n').length).toBeLessThanOrEqual(8);
    });

    it('strips completion prefix label', () => {
      expect(normalizeCompletion('completion: foo()', '', '')).toBe('foo()');
    });

    it('trims repeated prefix and suffix overlap with surrounding code', () => {
      expect(normalizeCompletion('const value = 1;', 'const value = ', ' = 2;')).toBe(' 1;');
    });

    it('fixes JSX className and opening-tag completions', () => {
      expect(normalizeCompletion('MyClass}', 'return <div className={', '')).toBe('MyClass}');
      const before = '<ul><li><Button /> first</li><li><Button /> second</li><li><';
      expect(normalizeCompletion('next item', before, '')).toContain('Button />');
    });

    it('skips explanatory prose before the first code-like line', () => {
      expect(normalizeCompletion('I think we should add:\nconst x = 1;', '', '')).toBe(
        'const x = 1;',
      );
    });
  });

  describe('buildCompletionPrompt', () => {
    it('includes file path and cursor marker', () => {
      const prompt = buildCompletionPrompt({
        filePath: 'src/test.js',
        before: 'const ',
        after: ' = 1;',
      });

      expect(prompt).toContain('File: src/test.js');
      expect(prompt).toContain('Language: JavaScript');
      expect(prompt).toContain('▮');
      expect(prompt).toContain('const ▮ = 1;');
      expect(prompt).toContain('Recent lines:');
      expect(prompt).toContain('<completion>');
    });

    it('includes rag context when provided', () => {
      const prompt = buildCompletionPrompt({
        filePath: 'src/test.js',
        before: '',
        after: '',
        ragContext: 'Related: foo',
      });
      expect(prompt).toContain('Related: foo');
    });

    it('labels each supported language extension', () => {
      expect(buildCompletionPrompt({ filePath: 'a.jsx', before: '', after: '' })).toContain(
        'JavaScript JSX',
      );
      expect(buildCompletionPrompt({ filePath: 'a.tsx', before: '', after: '' })).toContain(
        'TypeScript JSX',
      );
      expect(buildCompletionPrompt({ filePath: 'a.ts', before: '', after: '' })).toContain(
        'TypeScript',
      );
      expect(buildCompletionPrompt({ filePath: 'a.css', before: '', after: '' })).toContain('CSS');
      expect(buildCompletionPrompt({ filePath: 'a.html', before: '', after: '' })).toContain(
        'HTML',
      );
      expect(buildCompletionPrompt({ filePath: 'a.json', before: '', after: '' })).toContain(
        'JSON',
      );
      expect(buildCompletionPrompt({ filePath: 'a.md', before: '', after: '' })).toContain(
        'Markdown',
      );
      expect(buildCompletionPrompt({ filePath: 'a.txt', before: '', after: '' })).toContain(
        'Plain text',
      );
    });
  });

  describe('buildCompletionRagQuery', () => {
    it('combines recent lines and the current partial token', () => {
      const before = 'function run() {\n  const value = get';
      expect(buildCompletionRagQuery(before)).toBe('function run() {\n  const value = get\nget');
    });
  });

  describe('normalizeStreamingCompletion', () => {
    it('returns empty text until the completion tag opens', () => {
      expect(normalizeStreamingCompletion('<comp', 'const ', '')).toBe('');
    });

    it('returns partial text from an unclosed completion tag', () => {
      expect(normalizeStreamingCompletion('<completion>value', 'foo.', '')).toBe('value');
    });

    it('strips mid-stream noise before showing code', () => {
      expect(
        normalizeStreamingCompletion('<think>hidden</think>\n<completion>log(', 'console.', ''),
      ).toBe('log(');
    });
  });

  describe('getNextSuggestionWord', () => {
    it('accepts the first word including trailing whitespace', () => {
      expect(getNextSuggestionWord('foo bar')).toBe('foo ');
    });

    it('includes leading whitespace on the first chunk', () => {
      expect(getNextSuggestionWord('  foo bar')).toBe('  foo ');
    });
  });

  describe('getCompletionActivityMessage', () => {
    it('describes each completion phase', () => {
      expect(getCompletionActivityMessage(null)).toBeNull();
      expect(getCompletionActivityMessage({})).toBeNull();
      expect(getCompletionActivityMessage({ phase: 'debouncing' })).toBe(
        'Waiting for you to pause typing…',
      );
      expect(getCompletionActivityMessage({ phase: 'retrieving-context' })).toBe(
        'Searching project context…',
      );
      expect(getCompletionActivityMessage({ phase: 'resolving-model' })).toBe(
        'Loading completion model…',
      );
      expect(getCompletionActivityMessage({ phase: 'resolving-model', model: 'm1' })).toBe(
        'Loading m1…',
      );
      expect(getCompletionActivityMessage({ phase: 'generating' })).toBe(
        'Generating code completion…',
      );
      expect(
        getCompletionActivityMessage({
          phase: 'generating',
          model: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
        }),
      ).toBe('Generating completion with Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC…');
      expect(getCompletionActivityMessage({ phase: 'unknown' })).toBeNull();
    });
  });

  describe('getCompletionStatusMessage', () => {
    it('falls back to debouncing when thinking without a recorded phase', () => {
      expect(getCompletionStatusMessage({}, false)).toBeNull();
      expect(getCompletionStatusMessage({}, true)).toBe('Waiting for you to pause typing…');
    });
  });

  describe('language-aware prompts and polishing', () => {
    it('labels languages by extension', () => {
      expect(buildCompletionPrompt({ filePath: 'a.jsx', before: '', after: '' })).toContain(
        'Language: JavaScript JSX',
      );
      expect(buildCompletionPrompt({ filePath: 'a.tsx', before: '', after: '' })).toContain(
        'Language: TypeScript JSX',
      );
      expect(buildCompletionPrompt({ filePath: 'a.ts', before: '', after: '' })).toContain(
        'Language: TypeScript',
      );
      expect(buildCompletionPrompt({ filePath: 'a.css', before: '', after: '' })).toContain(
        'Language: CSS',
      );
      expect(buildCompletionPrompt({ filePath: 'a.html', before: '', after: '' })).toContain(
        'Language: HTML',
      );
      expect(buildCompletionPrompt({ filePath: 'a.json', before: '', after: '' })).toContain(
        'Language: JSON',
      );
      expect(buildCompletionPrompt({ filePath: 'a.md', before: '', after: '' })).toContain(
        'Language: Markdown',
      );
      expect(buildCompletionPrompt({ filePath: 'a.txt', before: '', after: '' })).toContain(
        'Language: Plain text',
      );
    });

    it('fixes jsx className and opening-tag completions', () => {
      expect(normalizeCompletion('className={styles.card}', 'className={', '')).toBe(
        'styles.card}',
      );
      expect(normalizeCompletion('{styles.card}}', 'className={', '')).toBe('styles.card}');
      expect(normalizeCompletion('more text', '<li><Icon /> label</li>\n<li><', '')).toContain(
        'Icon',
      );
      expect(normalizeCompletion('Button />', '<div><', '')).toBe('Button />');
    });

    it('trims overlapping before/after text and streaming edges', () => {
      expect(normalizeCompletion('foo bar', 'foo ', ' bar').trim()).toBe('');
      expect(normalizeCompletion('answer: const x = 1;', '', '')).toBe('const x = 1;');
      expect(normalizeStreamingCompletion('</completion>', '', '')).toBe('');
      expect(normalizeStreamingCompletion('<completion></completion>', '', '')).toBe('');
      expect(getNextSuggestionWord('')).toBe('');
      expect(getNextSuggestionWord('   ')).toBe('   ');
    });
  });
});
