import { makeKeyboardEvent } from '@/test-utils/domMocks';
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

import { isMac } from '@/utils/os';

const mockIsMac = vi.mocked(isMac);

describe('Shortcuts isMatch', () => {
  it('matches Cmd+B on Mac', () => {
    mockIsMac.mockReturnValue(true);
    expect(isMatch(makeKeyboardEvent({ key: 'b', metaKey: true }), { key: 'b', modifier: 'cmd' })).toBe(
      true,
    );
  });

  it('matches Ctrl+B on Windows', () => {
    mockIsMac.mockReturnValue(false);
    expect(isMatch(makeKeyboardEvent({ key: 'b', ctrlKey: true }), { key: 'b', modifier: 'cmd' })).toBe(
      true,
    );
  });

  it('matches Cmd+Shift+Z', () => {
    mockIsMac.mockReturnValue(true);
    expect(
      isMatch(makeKeyboardEvent({ key: 'z', metaKey: true, shiftKey: true }), {
        key: 'z',
        modifier: 'cmd-shift',
      }),
    ).toBe(true);
  });

  it('does not match if shift is pressed but not expected', () => {
    mockIsMac.mockReturnValue(true);
    expect(
      isMatch(makeKeyboardEvent({ key: 'b', metaKey: true, shiftKey: true }), { key: 'b', modifier: 'cmd' }),
    ).toBe(false);
  });

  it('matches multiple keys', () => {
    mockIsMac.mockReturnValue(true);
    const shortcut = { key: ['Backspace', '.'], modifier: 'cmd' };
    expect(isMatch(makeKeyboardEvent({ key: 'Backspace', metaKey: true }), shortcut)).toBe(true);
    expect(isMatch(makeKeyboardEvent({ key: '.', metaKey: true }), shortcut)).toBe(true);
  });

  it('filters based on platform', () => {
    mockIsMac.mockReturnValue(true);
    const shortcutMac = { key: 'b', modifier: 'cmd', platform: 'mac' as const };
    const eventMac = makeKeyboardEvent({ key: 'b', metaKey: true });
    expect(isMatch(eventMac, shortcutMac)).toBe(true);

    mockIsMac.mockReturnValue(false);
    expect(isMatch(eventMac, shortcutMac)).toBe(false);

    const shortcutWin = { key: 'b', modifier: 'alt', platform: 'win' as const };
    const eventWin = makeKeyboardEvent({ key: 'b', altKey: true });
    expect(isMatch(eventWin, shortcutWin)).toBe(true);

    mockIsMac.mockReturnValue(true);
    expect(isMatch(eventWin, shortcutWin)).toBe(false);
  });

  it('matches Alt key modifier', () => {
    mockIsMac.mockReturnValue(true);
    const shortcut = { key: 'b', modifier: 'alt' };
    expect(isMatch(makeKeyboardEvent({ key: 'b', altKey: true }), shortcut)).toBe(true);
    expect(isMatch(makeKeyboardEvent({ key: 'b' }), shortcut)).toBe(false);
  });

  it('matches Shift+Tab', () => {
    mockIsMac.mockReturnValue(true);
    expect(isMatch(makeKeyboardEvent({ key: 'Tab', shiftKey: true }), { key: 'Tab', modifier: 'shift' })).toBe(
      true,
    );
  });

  it('matches Ctrl+T and Ctrl+Shift+T', () => {
    mockIsMac.mockReturnValue(true);
    expect(isMatch(makeKeyboardEvent({ key: 't', ctrlKey: true }), { key: 't', modifier: 'ctrl' })).toBe(
      true,
    );
    expect(
      isMatch(makeKeyboardEvent({ key: 't', ctrlKey: true, shiftKey: true }), {
        key: 't',
        modifier: 'ctrl-shift',
      }),
    ).toBe(true);
  });

  it('matches Ctrl+L', () => {
    mockIsMac.mockReturnValue(true);
    expect(isMatch(makeKeyboardEvent({ key: 'l', ctrlKey: true }), { key: 'l', modifier: 'ctrl' })).toBe(
      true,
    );
  });

  it('triggers toggle-inspect-mode action and switches modes correctly', () => {
    const shortcut = SHORTCUTS.find((s) => s.id === 'toggle-inspect-mode');
    expect(shortcut).toBeDefined();

    const showNotification = vi.fn();
    const draftState = { isReadOnly: false };
    const editorState = vi.fn((producer: (draft: typeof draftState) => void) => {
      producer(draftState);
    });

    shortcut!.action!({ editorState: editorState as never, showNotification });
    expect(draftState.isReadOnly).toBe(true);
    expect(showNotification).toHaveBeenCalledWith('Inspection mode active', 'info');

    shortcut!.action!({ editorState: editorState as never, showNotification });
    expect(draftState.isReadOnly).toBe(false);
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
      navigationHistory: { stack: mockStack, currentIndex: 2 },
      cursorPos: {} as Record<string, { line: number; col: number; index: number }>,
      shouldScrollTo: null as { filePath: string; line: number } | null,
    };

    const editorState = vi.fn((producer: (draft: typeof editorDraft) => void) => {
      producer(editorDraft);
    });

    const tabDraft = {
      openTabs: [{ id: 'src/App.js', type: 'file', label: 'App.js' }],
      activeTabId: 'src/utils.js',
    };
    const tabState = vi.fn((producer: (draft: typeof tabDraft) => void) => {
      producer(tabDraft);
    });

    backShortcut!.action!({ editorState: editorState as never, tabState: tabState as never });
    expect(editorDraft.navigationHistory.currentIndex).toBe(1);
    expect(editorDraft.cursorPos['src/index.css']).toEqual({ line: 5, col: 1, index: 40 });
    expect(editorDraft.shouldScrollTo?.filePath).toBe('src/index.css');
    expect(editorDraft.shouldScrollTo?.line).toBe(5);
    expect(tabDraft.activeTabId).toBe('src/index.css');

    forwardShortcut!.action!({ editorState: editorState as never, tabState: tabState as never });
    expect(editorDraft.navigationHistory.currentIndex).toBe(2);
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
    const tabState = vi.fn((producer: (draft: typeof tabDraft) => void) => {
      producer(tabDraft);
    });

    nextShortcut!.action!({ tabState: tabState as never });
    expect(tabDraft.activeTabId).toBe('src/index.css');
    nextShortcut!.action!({ tabState: tabState as never });
    expect(tabDraft.activeTabId).toBe('preview');
    nextShortcut!.action!({ tabState: tabState as never });
    expect(tabDraft.activeTabId).toBe('src/App.js');
    previousShortcut!.action!({ tabState: tabState as never });
    expect(tabDraft.activeTabId).toBe('preview');
  });

  it('matches ctrl-alt and cmd-alt key combinations', () => {
    mockIsMac.mockReturnValue(true);
    expect(
      isMatch(makeKeyboardEvent({ key: 'p', ctrlKey: true, altKey: true }), { key: 'p', modifier: 'ctrl-alt' }),
    ).toBe(true);
    expect(
      isMatch(makeKeyboardEvent({ key: 'p', metaKey: true, altKey: true }), { key: 'p', modifier: 'cmd-alt' }),
    ).toBe(true);
  });

  it('triggers toggle-theme action correctly', () => {
    const themeShortcut = SHORTCUTS.find((s) => s.id === 'toggle-theme');
    expect(themeShortcut).toBeDefined();
    const appDraft = { theme: 'dark' };
    const appState = vi.fn((producer: (draft: typeof appDraft) => void) => {
      producer(appDraft);
    });
    themeShortcut!.action!({ appState: appState as never });
    expect(appDraft.theme).toBe('light');
    themeShortcut!.action!({ appState: appState as never });
    expect(appDraft.theme).toBe('dark');
  });

  it('triggers close-modal action correctly', () => {
    const closeModalShortcut = SHORTCUTS.find((s) => s.id === 'close-modal');
    expect(closeModalShortcut).toBeDefined();
    const appDraft = { showShortcuts: true, showCompletionDebug: true };
    const appState = vi.fn((producer: (draft: typeof appDraft) => void) => {
      producer(appDraft);
    });
    closeModalShortcut!.action!({ appState: appState as never });
    expect(appDraft.showShortcuts).toBe(false);
    expect(appDraft.showCompletionDebug).toBe(false);
  });
});
