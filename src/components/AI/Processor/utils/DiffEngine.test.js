import { describe, expect, it } from 'vitest';
import { computeDiff } from './DiffEngine';

describe('computeDiff metadata', () => {
  it.each([
    ['replacement', 'one\ntwo\nthree', 'one\nchanged\nthree'],
    ['addition', 'one\nthree', 'one\ntwo\nthree'],
    ['deletion', 'one\ntwo\nthree', 'one\nthree'],
    ['multiline replacement', 'one\ntwo\nthree\nfour', 'one\nsecond\nthird\nfour'],
  ])('tracks original and modified ranges for a %s', (_name, original, updated) => {
    const result = computeDiff(original, updated);
    expect(result.content).toBe(updated);
    expect(result.diffs.length).toBeGreaterThan(0);
    for (const diff of result.diffs) {
      expect(original.slice(diff.origStart, diff.origEnd)).toBe(diff.original);
      expect(updated.slice(diff.start, diff.end)).toBe(diff.updated);
    }
  });

  it('tracks multiple separated changes', () => {
    const original = 'one\ntwo\nthree\nfour\nfive';
    const updated = 'ONE\ntwo\nthree\nfour\nFIVE';
    const { diffs } = computeDiff(original, updated);
    expect(diffs).toHaveLength(2);
    expect(diffs.map(({ original: value }) => value)).toEqual(['one', 'five']);
    expect(diffs.map(({ updated: value }) => value)).toEqual(['ONE', 'FIVE']);
  });
});

import { applyMarkerReplacement } from './DiffEngine';

describe('applyMarkerReplacement', () => {
  it('replaces marked lines using context heuristics', () => {
    const original = 'first line\nsecond line\nthird line\nfourth line';
    const updated = 'first line\nnew second line content /* <<< NEW LINE >>> */\nthird line\nfourth line';

    const result = applyMarkerReplacement(original, updated);
    expect(result.content).toBe('first line\nnew second line content\nthird line\nfourth line');
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0].original).toBe('second line');
  });

  it('falls back to computeDiff if no markers are present', () => {
    const original = 'first line\nsecond line';
    const updated = 'first line\nsecond line updated';

    const result = applyMarkerReplacement(original, updated);
    expect(result.content).toBe(updated);
    expect(result.diffs.length).toBeGreaterThan(0);
  });
});
