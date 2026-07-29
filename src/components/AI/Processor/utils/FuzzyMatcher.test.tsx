import { describe, expect, it } from 'vitest';
import { applyFuzzyReplacement, applyHeuristicInsertion } from './FuzzyMatcher';

describe('FuzzyMatcher', () => {
  describe('applyFuzzyReplacement', () => {
    it('returns empty diffs if no anchor found', () => {
      const original = 'line1\nline2';
      const snippet = 'completely different';
      const result = applyFuzzyReplacement(original, snippet);
      expect(result.diffs).toEqual([]);
    });

    it('performs backward search match correctly', () => {
      const original = 'first\nsecond\nthird\nfourth\nfifth';
      // Snippet contains backward context 'second' and anchor 'third'
      const snippet = 'second\nthird\nnew line';
      const result = applyFuzzyReplacement(original, snippet);
      expect(result.content).toBe('first\nsecond\nthird\nnew line\nfourth\nfifth');
    });
  });

  describe('applyHeuristicInsertion', () => {
    it('returns null if there are fewer than 2 matching elements', () => {
      const original = '<ul>\n  <li>Apple</li>\n</ul>';
      const snippet = '<li>Banana</li>';
      const result = applyHeuristicInsertion(original, snippet);
      expect(result).toBeNull();
    });

    it('inserts item correctly when at least 2 similar items are found', () => {
      const original =
        '<ul>\n  <li className="item">Apple</li>\n  <li className="item">Banana</li>\n</ul>';
      const snippet = '<li className="item">Cherry</li>';
      const result = applyHeuristicInsertion(original, snippet);
      expect(result).not.toBeNull();
      expect(result.content).toContain('Banana</li>\n  <li className="item">Cherry</li>');
    });
  });
});
