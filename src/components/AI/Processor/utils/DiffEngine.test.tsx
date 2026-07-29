import { describe, expect, it } from 'vitest';
import { applyMarkerReplacement, applyTargetedReplacement, computeDiff } from './DiffEngine';

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

  it('returns empty diffs when content is unchanged', () => {
    const result = computeDiff('same\ncontent', 'same\ncontent');
    expect(result.content).toBe('same\ncontent');
    expect(result.diffs).toEqual([]);
  });

  it('filters diffs to selected line ranges and reconstructs partial content', () => {
    const original = 'line one\nline two\nline three\nline four';
    const updated = 'LINE ONE\nline two\nLINE THREE\nline four';
    const result = computeDiff(original, updated, [1, 3]);
    expect(result.content).toBe('LINE ONE\nline two\nLINE THREE\nline four');
    expect(result.diffs.length).toBeGreaterThan(0);
  });

  it('returns original when selected lines exclude all changes', () => {
    const original = 'alpha\nbeta\ngamma';
    const updated = 'ALPHA\nbeta\nGAMMA';
    const result = computeDiff(original, updated, [2]);
    expect(result.content).toBe(original);
    expect(result.diffs).toEqual([]);
  });
});

describe('applyTargetedReplacement', () => {
  it('returns original when no lines are selected', () => {
    const result = applyTargetedReplacement('one\ntwo', 'snippet', []);
    expect(result.content).toBe('one\ntwo');
    expect(result.diffs).toEqual([]);
  });

  it('replaces the selected line range with a snippet', () => {
    const original = 'first\nsecond\nthird\nfourth';
    const result = applyTargetedReplacement(original, 'REPLACED', [2, 3]);
    expect(result.content).toBe('first\nREPLACED\nfourth');
    expect(result.diffs[0].original).toBe('second\nthird');
  });
});

describe('applyMarkerReplacement', () => {
  it('replaces marked lines using context heuristics', () => {
    const original = 'first line\nsecond line\nthird line\nfourth line';
    const updated =
      'first line\nnew second line content /* <<< NEW LINE >>> */\nthird line\nfourth line';

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

  it('supports block and JSX NEW LINE marker variants', () => {
    const original = 'header\nold body\nfooter';
    const updated = 'header\nnew body /* NEW LINE */\nfooter';
    const blockResult = applyMarkerReplacement(original, updated);
    expect(blockResult.content).toBe('header\nnew body\nfooter');

    const jsxOriginal = 'wrap\nold\nend';
    const jsxUpdated = 'wrap\nnew <!-- NEW LINE -->\nend';
    const jsxResult = applyMarkerReplacement(jsxOriginal, jsxUpdated);
    expect(jsxResult.content).toBe('wrap\nnew\nend');
  });

  it('falls back to computeDiff when markers have no matching context', () => {
    const original = 'alpha\nbeta';
    const updated = 'alpha\n// <<< NEW LINE >>>\ngamma';
    const result = applyMarkerReplacement(original, updated);
    expect(result.content).toContain('gamma');
    expect(result.diffs.length).toBeGreaterThan(0);
  });
});
