import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeDiff } from './DiffEngine';

describe('computeDiff properties', () => {
  it('always returns the requested target content and bounded offsets', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 300 }),
        fc.string({ maxLength: 300 }),
        (original, updated) => {
          const result = computeDiff(original, updated);
          expect(result.content).toBe(updated);
          for (const diff of result.diffs) {
            expect(diff.start).toBeGreaterThanOrEqual(0);
            expect(diff.end).toBeGreaterThanOrEqual(diff.start);
            expect(diff.origStart).toBeGreaterThanOrEqual(0);
            expect(diff.origEnd).toBeGreaterThanOrEqual(diff.origStart);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
