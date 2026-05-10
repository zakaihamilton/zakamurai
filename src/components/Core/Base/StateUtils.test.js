import { describe, expect, it, vi } from 'vitest';
import { setInDraft, updateInDraft } from './StateUtils';

describe('StateUtils', () => {
  describe('setInDraft', () => {
    it('should set a top-level property', () => {
      const draft = { a: 1 };
      setInDraft(draft, ['a'], 2);
      expect(draft.a).toBe(2);
    });

    it('should set a nested property and shallow copy ancestors', () => {
      const b = { c: 3 };
      const draft = { a: { b } };
      const originalA = draft.a;

      setInDraft(draft, ['a', 'b', 'c'], 4);

      expect(draft.a.b.c).toBe(4);
      // Ancestors should be shallow copied
      expect(draft.a).not.toBe(originalA);
      expect(draft.a.b).not.toBe(b);
      // But other properties should be preserved
      expect(originalA.b).toBe(b);
    });

    it('should do nothing if path is empty', () => {
      const draft = { a: 1 };
      setInDraft(draft, [], 2);
      expect(draft.a).toBe(1);
    });

    it('should do nothing if path is null or undefined', () => {
      const draft = { a: 1 };
      setInDraft(draft, null, 2);
      expect(draft.a).toBe(1);
      setInDraft(draft, undefined, 2);
      expect(draft.a).toBe(1);
    });
  });

  describe('updateInDraft', () => {
    it('should update a nested property using a producer', () => {
      const b = { c: 3 };
      const draft = { a: { b } };
      const originalA = draft.a;

      const producer = vi.fn((val) => val + 1);

      updateInDraft(draft, ['a', 'b', 'c'], producer);

      expect(draft.a.b.c).toBe(4);
      expect(producer).toHaveBeenCalledWith(3);
      // Ancestors should be shallow copied
      expect(draft.a).not.toBe(originalA);
      expect(draft.a.b).not.toBe(b);
    });

    it('should do nothing if path is empty', () => {
      const draft = { a: 1 };
      updateInDraft(draft, [], (v) => v + 1);
      expect(draft.a).toBe(1);
    });

    it('should do nothing if path is null or undefined', () => {
      const draft = { a: 1 };
      updateInDraft(draft, null, (v) => v + 1);
      expect(draft.a).toBe(1);
    });
  });
});
