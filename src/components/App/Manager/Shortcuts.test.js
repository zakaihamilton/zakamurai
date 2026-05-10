import { describe, expect, it, vi } from 'vitest';
import { isMatch } from './Shortcuts';

vi.mock('@/utils/os', () => ({
  isMac: vi.fn(),
}));

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
});
