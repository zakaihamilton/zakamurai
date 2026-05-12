import { describe, expect, test } from 'vitest';
import {
  applyFileUpdate,
  applySearchReplace,
  applyTargetedReplacement,
  computeDiff,
} from './Applier';

describe('Applier', () => {
  describe('applyFileUpdate', () => {
    test('uses search/replace if marker present', () => {
      const original = 'line1\nline2';
      const update = '<<<<<<< SEARCH\nline1\n=======\nnew1\n>>>>>>> REPLACE';
      const result = applyFileUpdate(original, update);
      expect(result.content).toBe('new1\nline2');
    });

    test('uses targeted replacement for snippets', () => {
      const original = 'line1\nline2\nline3';
      const snippet = 'new line';
      // snippets are < 80% of original length
      const result = applyFileUpdate(original, snippet, [2]);
      expect(result.content).toBe('line1\nnew line\nline3');
    });
  });

  describe('applySearchReplace', () => {
    const original = `function hello() {
  console.log("hello");
}

function world() {
  console.log("world");
}`;

    test('single block replacement', () => {
      const blocks = `<<<<<<< SEARCH
function world() {
  console.log("world");
}
=======
function world() {
  console.log("earth");
}
>>>>>>> REPLACE`;
      const result = applySearchReplace(original, blocks);
      expect(result.content).toContain('console.log("earth")');
      expect(result.diffs.length).toBe(1);
      expect(result.diffs[0].original).toContain('world');
    });

    test('multiple blocks', () => {
      const blocks = `<<<<<<< SEARCH
  console.log("hello");
=======
  console.log("hi");
>>>>>>> REPLACE
<<<<<<< SEARCH
  console.log("world");
=======
  console.log("everyone");
>>>>>>> REPLACE`;
      const result = applySearchReplace(original, blocks);
      expect(result.content).toContain('console.log("hi")');
      expect(result.content).toContain('console.log("everyone")');
      expect(result.diffs.length).toBe(2);
    });

    test('skips placeholder search without selected lines', () => {
      const blocks = `<<<<<<< SEARCH
[exact existing lines]
=======
replacement
>>>>>>> REPLACE`;
      const result = applySearchReplace(original, blocks);
      expect(result.content).toBe(original);
      expect(result.diffs.length).toBe(0);
    });

    test('applies placeholder search to selected lines when available', () => {
      const blocks = `<<<<<<< SEARCH
[exact existing lines]
=======
  console.log("earth");
>>>>>>> REPLACE`;
      const result = applySearchReplace(original, blocks, [6]);
      expect(result.content).toContain('console.log("earth")');
      expect(result.content).not.toContain('console.log("world")');
      expect(result.diffs.length).toBe(1);
    });

    test('deduplicates heavily repeated replacement lines', () => {
      const blocks = `<<<<<<< SEARCH
  console.log("world");
=======
  console.log("earth");
  console.log("moon");
  console.log("earth");
  console.log("moon");
  console.log("earth");
  console.log("moon");
  console.log("earth");
  console.log("moon");
>>>>>>> REPLACE`;
      const result = applySearchReplace(original, blocks);
      expect(result.content.match(/console\.log\("earth"\)/g)).toHaveLength(1);
      expect(result.content.match(/console\.log\("moon"\)/g)).toHaveLength(1);
    });
  });

  describe('computeDiff', () => {
    const original = 'one\ntwo\nthree';
    const updated = 'one\nchanged\nthree';

    test('detects change', () => {
      const result = computeDiff(original, updated);
      expect(result.content).toBe(updated);
      expect(result.diffs.length).toBe(1);
      expect(result.diffs[0].original).toBe('two');
    });

    test('filters by selectedLines', () => {
      // Line 2 is "two"
      const result = computeDiff(original, updated, [1]);
      expect(result.content).toBe(original);
      expect(result.diffs.length).toBe(0);
    });
  });

  describe('applyTargetedReplacement', () => {
    const original = 'line1\nline2\nline3\nline4';
    const snippet = 'new line 2\nnew line 3';

    test('replaces selected range', () => {
      const result = applyTargetedReplacement(original, snippet, [2, 3]);
      expect(result.content).toBe('line1\nnew line 2\nnew line 3\nline4');
      expect(result.diffs[0].original).toBe('line2\nline3');
    });
  });
});
