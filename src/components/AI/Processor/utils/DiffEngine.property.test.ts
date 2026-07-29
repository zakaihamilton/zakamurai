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
            expect(diff.start ?? 0).toBeGreaterThanOrEqual(0);
            expect(diff.end ?? 0).toBeGreaterThanOrEqual(diff.start ?? 0);
            expect(diff.origStart ?? 0).toBeGreaterThanOrEqual(0);
            expect(diff.origEnd ?? 0).toBeGreaterThanOrEqual(diff.origStart ?? 0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
