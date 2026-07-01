import { describe, expect, it } from 'vitest';
import { applySearchReplace } from './SearchReplaceParser';

describe('SearchReplaceParser', () => {
  it('handles empty search blocks (pure insertions)', () => {
    const original = 'line1\nline2';
    const blocks = `<<<<<<< SEARCH

=======
new insert
>>>>>>> REPLACE`;
    const result = applySearchReplace(original, blocks);
    expect(result.content).toBe('line1\nline2new insert');
    expect(result.diffs[0]).toEqual({
      start: 11,
      end: 21,
      type: 'replacement',
      original: '',
    });
  });

  it('filters replacement by selectedLines ranges', () => {
    const original = 'line1\nline2\nline3';
    const blocks = `<<<<<<< SEARCH
line2
=======
line2-new
>>>>>>> REPLACE`;
    // Line 2 is within [2] index (1-indexed). Let's test with a selected line index that doesn't overlap
    const resultNotAllowed = applySearchReplace(original, blocks, [1]); // only line 1 selected
    expect(resultNotAllowed.content).toBe(original);

    // Now test with overlapping selected line
    const resultAllowed = applySearchReplace(original, blocks, [2]); // line 2 selected
    expect(resultAllowed.content).toBe('line1\nline2-new\nline3');
  });
});
