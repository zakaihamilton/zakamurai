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

  it('matches Ctrl+T and Ctrl+Shift+T', () => {
    isMac.mockReturnValue(true);
    const nextShortcut = { key: 't', modifier: 'ctrl' };
    const previousShortcut = { key: 't', modifier: 'ctrl-shift' };

    expect(
      isMatch(
        { key: 't', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false },
        nextShortcut,
      ),
    ).toBe(true);
    expect(
      isMatch(
        { key: 't', metaKey: false, ctrlKey: true, shiftKey: true, altKey: false },
        previousShortcut,
      ),
    ).toBe(true);
  });

  it('matches Ctrl+L', () => {
    isMac.mockReturnValue(true);
    const shortcut = { key: 'l', modifier: 'ctrl' };

    expect(
      isMatch(
        { key: 'l', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false },
        shortcut,
      ),
    ).toBe(true);
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

  it('navigates back and forward correctly', () => {
    const backShortcut = SHORTCUTS.find((s) => s.id === 'navigate-back');
    const forwardShortcut = SHORTCUTS.find((s) => s.id === 'navigate-forward');

    expect(backShortcut).toBeDefined();
    expect(forwardShortcut).toBeDefined();

    const mockStack = [
      { filePath: 'src/App.js', loc: { line: 10, col: 5, index: 120 } },
      { filePath: 'src/index.css', loc: { line: 5, col: 1, index: 40 } },
      { filePath: 'src/utils.js', loc: { line: 20, col: 10, index: 310 } },
    ];

    const editorDraft = {
      fileContents: {
        'src/App.js': 'App content',
        'src/index.css': 'CSS content',
        'src/utils.js': 'Utils content',
      },
      navigationHistory: {
        stack: mockStack,
        currentIndex: 2,
      },
      cursorPos: {},
      shouldScrollTo: null,
    };

    const editorState = vi.fn((producer) => {
      producer(editorDraft);
    });
    editorState.navigationHistory = editorDraft.navigationHistory;
    editorState.fileContents = editorDraft.fileContents;

    const tabDraft = {
      openTabs: [{ id: 'src/App.js', type: 'file', label: 'App.js' }],
      activeTabId: 'src/utils.js',
    };

    const tabState = vi.fn((producer) => {
      producer(tabDraft);
    });

    // Action: navigate back
    backShortcut.action({ editorState, tabState });

    // Expecting to jump to index 1 (src/index.css:5)
    expect(editorDraft.navigationHistory.currentIndex).toBe(1);
    expect(editorDraft.cursorPos['src/index.css']).toEqual({ line: 5, col: 1, index: 40 });
    expect(editorDraft.shouldScrollTo.filePath).toBe('src/index.css');
    expect(editorDraft.shouldScrollTo.line).toBe(5);
    expect(tabDraft.activeTabId).toBe('src/index.css');
    expect(tabDraft.openTabs.some((t) => t.id === 'src/index.css')).toBe(true);

    // Action: navigate forward
    forwardShortcut.action({ editorState, tabState });

    // Expecting to jump back to index 2 (src/utils.js:20)
    expect(editorDraft.navigationHistory.currentIndex).toBe(2);
    expect(editorDraft.cursorPos['src/utils.js']).toEqual({ line: 20, col: 10, index: 310 });
    expect(editorDraft.shouldScrollTo.filePath).toBe('src/utils.js');
    expect(editorDraft.shouldScrollTo.line).toBe(20);
    expect(tabDraft.activeTabId).toBe('src/utils.js');
  });

  it('switches tabs forward and backward with wraparound', () => {
    const nextShortcut = SHORTCUTS.find((s) => s.id === 'next-tab');
    const previousShortcut = SHORTCUTS.find((s) => s.id === 'previous-tab');

    expect(nextShortcut).toBeDefined();
    expect(previousShortcut).toBeDefined();

    const tabDraft = {
      openTabs: [
        { id: 'src/App.js', type: 'file', label: 'App.js' },
        { id: 'src/index.css', type: 'file', label: 'index.css' },
        { id: 'preview', type: 'preview', label: 'Preview' },
      ],
      activeTabId: 'src/App.js',
    };
    const tabState = vi.fn((producer) => {
      producer(tabDraft);
      tabState.openTabs = tabDraft.openTabs;
      tabState.activeTabId = tabDraft.activeTabId;
    });
    tabState.openTabs = tabDraft.openTabs;
    tabState.activeTabId = tabDraft.activeTabId;

    nextShortcut.action({ tabState });
    expect(tabDraft.activeTabId).toBe('src/index.css');

    nextShortcut.action({ tabState });
    expect(tabDraft.activeTabId).toBe('preview');

    nextShortcut.action({ tabState });
    expect(tabDraft.activeTabId).toBe('src/App.js');

    previousShortcut.action({ tabState });
    expect(tabDraft.activeTabId).toBe('preview');
  });
});
