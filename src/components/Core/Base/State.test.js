import { describe, expect, it } from 'vitest';
import { isSelectorMatch } from './State';

describe('State utils', () => {
  describe('isSelectorMatch', () => {
    it('returns true when selector is undefined', () => {
      expect(isSelectorMatch(undefined, 'anyKey')).toBe(true);
    });

    it('returns false when selector is falsy', () => {
      expect(isSelectorMatch(null, 'anyKey')).toBe(false);
      expect(isSelectorMatch('', 'anyKey')).toBe(false);
    });

    it('returns true when selector matches key (string)', () => {
      expect(isSelectorMatch('key', 'key')).toBe(true);
      expect(isSelectorMatch('key', 'other')).toBe(false);
    });

    it('returns true when selector matches key (function)', () => {
      expect(isSelectorMatch((key) => key === 'key', 'key')).toBe(true);
      expect(isSelectorMatch((key) => key === 'key', 'other')).toBe(false);
    });

    it('returns true when selector matches key (array)', () => {
      expect(isSelectorMatch(['key', 'other'], 'key')).toBe(true);
      expect(isSelectorMatch(['key', 'other'], 'other')).toBe(true);
      expect(isSelectorMatch(['key', 'other'], 'third')).toBe(false);
    });

    it('returns true when selector matches key (object map)', () => {
      expect(isSelectorMatch({ key: true, other: false }, 'key')).toBe(true);
      expect(isSelectorMatch({ key: true, other: false }, 'other')).toBe(false);
      expect(isSelectorMatch({ key: true, other: false }, 'third')).toBe(undefined);
    });
  });
});
