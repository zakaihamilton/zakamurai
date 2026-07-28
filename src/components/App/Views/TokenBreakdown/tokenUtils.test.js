import { describe, expect, it } from 'vitest';
import {
  checkTokenReportMatch,
  compareTokensBySourceOrder,
  getFoldLabel,
  getFolds,
  getTokenLabel,
} from './tokenUtils';

describe('tokenUtils', () => {
  describe('getTokenLabel', () => {
    it('maps known token types and falls back for unknowns', () => {
      expect(getTokenLabel('hlKw')).toBe('Keyword');
      expect(getTokenLabel('hlCustom')).toBe('Custom');
      expect(getTokenLabel('plain')).toBe('plain');
      expect(getTokenLabel()).toBe('Token');
      expect(getTokenLabel('')).toBe('Token');
    });
  });

  describe('getFolds', () => {
    it('routes by file extension', () => {
      expect(Array.isArray(getFolds('{"a":1}', 'data.json'))).toBe(true);
      expect(Array.isArray(getFolds('.foo { color: red; }', 'styles.css'))).toBe(true);
      expect(Array.isArray(getFolds('function a() {\n  return 1;\n}', 'app.js'))).toBe(true);
    });
  });

  describe('getFoldLabel', () => {
    it('labels folds by language family', () => {
      expect(getFoldLabel('data.json')).toBe('JSON object');
      expect(getFoldLabel('styles.css')).toBe('CSS block');
      expect(getFoldLabel('app.js')).toBe('code block');
      expect(getFoldLabel('app.ts')).toBe('code block');
      expect(getFoldLabel('readme.md')).toBe('fold');
    });
  });

  describe('compareTokensBySourceOrder', () => {
    it('orders by start, then end, then index', () => {
      expect(
        compareTokensBySourceOrder(
          { range: { start: 2 }, index: 1 },
          { range: { start: 5 }, index: 0 },
        ),
      ).toBeLessThan(0);
      expect(
        compareTokensBySourceOrder(
          { range: { start: 2, end: 4 }, index: 1 },
          { range: { start: 2, end: 8 }, index: 0 },
        ),
      ).toBeLessThan(0);
      expect(
        compareTokensBySourceOrder(
          { range: { start: 2, end: 4 }, index: 3 },
          { range: { start: 2, end: 4 }, index: 1 },
        ),
      ).toBeGreaterThan(0);
      expect(
        compareTokensBySourceOrder({ index: 0 }, { range: { start: 1 }, index: 1 }),
      ).toBeGreaterThan(0);
    });
  });

  describe('checkTokenReportMatch', () => {
    it('reports a perfect reconstruction', () => {
      const code = 'ab';
      const result = checkTokenReportMatch(code, {
        tokens: [
          { value: 'a', range: { start: 0, end: 1 }, index: 0 },
          { value: 'b', range: { start: 1, end: 2 }, index: 1 },
        ],
      });
      expect(result.isMatch).toBe(true);
      expect(result.mismatches).toHaveLength(0);
      expect(result.reconstructedLength).toBe(2);
    });

    it('detects missing ranges, overlaps, value mismatches, and gaps', () => {
      const code = 'abcd';
      const result = checkTokenReportMatch(code, {
        tokens: [
          { value: 'a', range: { start: 0, end: 1 }, index: 0 },
          { value: 'missing', index: 1 },
          { value: 'xx', range: { start: 0, end: 2 }, index: 2 },
          { value: 'wrong', range: { start: 2, end: 4 }, index: 3 },
        ],
      });
      expect(result.isMatch).toBe(false);
      expect(result.mismatches.some((m) => m.reason.includes('Missing range'))).toBe(true);
      expect(result.mismatches.some((m) => m.reason.includes('Overlap'))).toBe(true);
      expect(result.mismatches.some((m) => m.reason.includes('Value mismatch'))).toBe(true);
    });

    it('handles unsorted tokens and trailing uncovered text', () => {
      const code = 'abc';
      const result = checkTokenReportMatch(code, {
        tokens: [
          { value: 'b', range: { start: 1, end: 2 }, index: 1 },
          { value: 'a', range: { start: 0, end: 1 }, index: 0 },
        ],
      });
      expect(result.isMatch).toBe(true);
      expect(result.reconstructedLength).toBe(3);
      expect(result.originalLength).toBe(3);

      const withGap = checkTokenReportMatch('abcd', {
        tokens: [{ value: 'ab', range: { start: 0, end: 2 }, index: 0 }],
      });
      expect(withGap.isMatch).toBe(true);
      expect(withGap.reconstructedLength).toBe(4);
    });
  });
});
