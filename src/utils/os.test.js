import { describe, expect, it, vi } from 'vitest';
import { formatShortcut, getControlKey, getModifierKey, getShiftKey, isMac } from './os';

describe('os utils', () => {
  describe('isMac', () => {
    it('returns true when navigator.platform is MAC', () => {
      vi.stubGlobal('navigator', { platform: 'MacIntel' });
      expect(isMac()).toBe(true);
    });

    it('returns false when navigator.platform is Win32', () => {
      vi.stubGlobal('navigator', { platform: 'Win32' });
      expect(isMac()).toBe(false);
    });
  });

  describe('getModifierKey', () => {
    it('returns ⌘ for Mac', () => {
      vi.stubGlobal('navigator', { platform: 'MacIntel' });
      expect(getModifierKey()).toBe('⌘');
    });

    it('returns Ctrl for non-Mac', () => {
      vi.stubGlobal('navigator', { platform: 'Win32' });
      expect(getModifierKey()).toBe('Ctrl');
    });
  });

  describe('formatShortcut', () => {
    it('returns the shortcut as-is for Mac', () => {
      vi.stubGlobal('navigator', { platform: 'MacIntel' });
      expect(formatShortcut('⌘S')).toBe('⌘S');
      expect(formatShortcut('⌘⇧K')).toBe('⌘⇧K');
    });

    it('formats shortcuts correctly for Windows/Linux', () => {
      vi.stubGlobal('navigator', { platform: 'Win32' });
      expect(formatShortcut('⌘S')).toBe('Ctrl + S');
      expect(formatShortcut('⌘⇧K')).toBe('Ctrl + Shift + K');
      expect(formatShortcut('⌃P')).toBe('Ctrl + P');
      expect(formatShortcut('⌥N')).toBe('Alt + N');
      expect(formatShortcut('⌘↵')).toBe('Ctrl + Enter');
    });
  });
});
