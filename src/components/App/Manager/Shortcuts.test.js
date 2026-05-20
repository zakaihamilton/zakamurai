import { describe, expect, it, vi } from 'vitest';
import { SHORTCUTS, isMatch } from './Shortcuts';

vi.mock('@/utils/os', () => ({
  isMac: vi.fn(),
}));

vi.mock('@/components/Storage/Settings', () => ({
  default: {
    getEditorReadOnly: vi.fn(() => false),
    setEditorReadOnly: vi.fn(),
  },
}));

import Settings from '@/components/Storage/Settings';
import { isMac } from '@/utils/os';

describe('Shortcuts isMatch', () => {
  it('matches Cmd+B on Mac', () => {
    isMac.mockReturnValue(true);
    const shortcut = { key: 'b', modifier: 'cmd' };
    const event = { key: 'b', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false };
    expect(isMatch(event, shortcut)).toBe(true);
  });

  it('matches Ctrl+B on Windows', () => {
    isMac.mockReturnValue(false);
    const shortcut = { key: 'b', modifier: 'cmd' };
    const event = { key: 'b', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false };
    expect(isMatch(event, shortcut)).toBe(true);
  });

  it('matches Cmd+Shift+Z', () => {
    isMac.mockReturnValue(true);
    const shortcut = { key: 'z', modifier: 'cmd-shift' };
    const event = { key: 'z', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false };
    expect(isMatch(event, shortcut)).toBe(true);
  });

  it('does not match if shift is pressed but not expected', () => {
    isMac.mockReturnValue(true);
    const shortcut = { key: 'b', modifier: 'cmd' };
    const event = { key: 'b', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false };
    expect(isMatch(event, shortcut)).toBe(false);
  });

  it('matches multiple keys', () => {
    isMac.mockReturnValue(true);
    const shortcut = { key: ['Backspace', '.'], modifier: 'cmd' };
    const event1 = {
      key: 'Backspace',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    };
    const event2 = { key: '.', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false };
    expect(isMatch(event1, shortcut)).toBe(true);
    expect(isMatch(event2, shortcut)).toBe(true);
  });

  it('filters based on platform', () => {
    // Mac shortcut on Mac: matches
    isMac.mockReturnValue(true);
    const shortcutMac = { key: 'b', modifier: 'cmd', platform: 'mac' };
    const eventMac = { key: 'b', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false };
    expect(isMatch(eventMac, shortcutMac)).toBe(true);

    // Mac shortcut on Windows: does not match
    isMac.mockReturnValue(false);
    expect(isMatch(eventMac, shortcutMac)).toBe(false);

    // Win shortcut on Windows: matches
    const shortcutWin = { key: 'b', modifier: 'alt', platform: 'win' };
    const eventWin = { key: 'b', metaKey: false, ctrlKey: false, shiftKey: false, altKey: true };
    expect(isMatch(eventWin, shortcutWin)).toBe(true);

    // Win shortcut on Mac: does not match
    isMac.mockReturnValue(true);
    expect(isMatch(eventWin, shortcutWin)).toBe(false);
  });

  it('matches Alt key modifier', () => {
    isMac.mockReturnValue(true);
    const shortcut = { key: 'b', modifier: 'alt' };
    const eventMatch = { key: 'b', metaKey: false, ctrlKey: false, shiftKey: false, altKey: true };
    const eventMismatch = {
      key: 'b',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    };
    expect(isMatch(eventMatch, shortcut)).toBe(true);
    expect(isMatch(eventMismatch, shortcut)).toBe(false);
  });

  it('triggers toggle-inspect-mode action and switches modes correctly', () => {
    const shortcut = SHORTCUTS.find((s) => s.id === 'toggle-inspect-mode');
    expect(shortcut).toBeDefined();

    const showNotification = vi.fn();
    const draftState = { isReadOnly: false };
    const editorState = vi.fn((producer) => {
      producer(draftState);
    });

    Settings.getEditorReadOnly.mockReturnValue(false);

    shortcut.action({ editorState, showNotification });

    expect(draftState.isReadOnly).toBe(true);
    expect(Settings.setEditorReadOnly).toHaveBeenCalledWith(true);
    expect(showNotification).toHaveBeenCalledWith('Inspection mode active', 'info');

    // Toggle again (from true to false)
    Settings.getEditorReadOnly.mockReturnValue(true);
    shortcut.action({ editorState, showNotification });

    expect(draftState.isReadOnly).toBe(false);
    expect(Settings.setEditorReadOnly).toHaveBeenCalledWith(false);
    expect(showNotification).toHaveBeenCalledWith('Edit mode active', 'info');
  });
});
