import { describe, expect, it } from 'vitest';
import { buildCompletionPrompt, normalizeCompletion } from './completionUtils';

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
  });
});
