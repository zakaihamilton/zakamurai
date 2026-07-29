import { describe, expect, it, vi } from 'vitest';
import {
  deleteInDraft,
  deleteKeysWithPrefixInDraft,
  remapKeysInDraft,
  setInDraft,
  updateInDraft,
} from './StateUtils';

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
      expect(draft.a).not.toBe(originalA);
      expect(draft.a.b).not.toBe(b);
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
      const producer = vi.fn((val: number) => val + 1);
      updateInDraft(draft, ['a', 'b', 'c'], producer);
      expect(draft.a.b.c).toBe(4);
      expect(producer).toHaveBeenCalledWith(3);
      expect(draft.a).not.toBe(originalA);
      expect(draft.a.b).not.toBe(b);
    });

    it('should do nothing if path is empty', () => {
      const draft = { a: 1 };
      updateInDraft(draft, [], (v: number) => v + 1);
      expect(draft.a).toBe(1);
    });

    it('should do nothing if path is null or undefined', () => {
      const draft = { a: 1 };
      updateInDraft(draft, null, (v: number) => v + 1);
      expect(draft.a).toBe(1);
    });
  });

  describe('deleteInDraft', () => {
    it('deletes a key while replacing the parent map', () => {
      const fileContents = { a: '1', b: '2' };
      const draft = { fileContents };
      deleteInDraft(draft, ['fileContents'], 'a');
      expect(draft.fileContents).toEqual({ b: '2' });
      expect(draft.fileContents).not.toBe(fileContents);
    });
  });

  describe('remapKeysInDraft', () => {
    it('remaps matching keys across multiple maps', () => {
      const draft = {
        fileContents: { 'src/a.js': '1', 'other.js': '2' },
        pendingDiffs: { 'src/a.js': { x: 1 } },
        cursorPos: { 'src/a.js': { line: 1 } },
      };
      remapKeysInDraft(
        draft,
        ['fileContents', 'pendingDiffs', 'cursorPos'],
        'src/a.js',
        'src/b.js',
      );
      expect(draft.fileContents).toEqual({ 'src/b.js': '1', 'other.js': '2' });
      expect((draft.pendingDiffs as Record<string, { x: number }>)['src/b.js']).toEqual({ x: 1 });
      expect((draft.cursorPos as Record<string, { line: number }>)['src/b.js']).toEqual({ line: 1 });
    });
  });

  describe('deleteKeysWithPrefixInDraft', () => {
    it('removes matching keys and replaces maps', () => {
      const fileContents = { 'src/a.js': '1', 'src/b.js': '2', 'other.js': '3' };
      const draft = { fileContents, pendingDiffs: { 'src/a.js': {} } };
      deleteKeysWithPrefixInDraft(draft, ['fileContents', 'pendingDiffs'], 'src/a.js');
      expect(draft.fileContents).toEqual({ 'src/b.js': '2', 'other.js': '3' });
      expect(draft.fileContents).not.toBe(fileContents);
      expect(draft.pendingDiffs).toEqual({});
    });
  });
});
