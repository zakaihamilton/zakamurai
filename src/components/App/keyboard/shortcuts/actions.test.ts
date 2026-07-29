import type { ShortcutActionContext } from '@/components/App/types';
import { describe, expect, it, vi } from 'vitest';
import {
  navigateBackAction,
  navigateForwardAction,
  switchTabAction,
  toggleCssJsAction,
} from './actions';

function asCtx(partial: Record<string, unknown>): ShortcutActionContext {
  return partial as unknown as ShortcutActionContext;
}

describe('shortcuts/actions', () => {
  it('toggleCssJsAction toggles sidebar when no active tab or unsupported file type', () => {
    const sidebarUpdater = vi.fn((cb) => cb({ isSidebarOpen: false }));
    const states = {
      editorState: { fileContents: {}, cursorPos: {} },
      tabState: { activeTabId: null },
      sidebarState: sidebarUpdater,
    };

    toggleCssJsAction(asCtx(states));
    expect(sidebarUpdater).toHaveBeenCalled();

    const statesTxt = {
      editorState: { fileContents: {}, cursorPos: {} },
      tabState: { activeTabId: 'readme.txt' },
      sidebarState: sidebarUpdater,
    };
    toggleCssJsAction(asCtx(statesTxt));
    expect(sidebarUpdater).toHaveBeenCalledTimes(2);
  });

  it('toggleCssJsAction navigates between associated CSS/JS files', () => {
    const tabUpdater = vi.fn((cb) => cb({ openTabs: [] }));
    const editorUpdater = vi.fn((cb) => cb({ cursorPos: {}, shouldScrollTo: null }));
    const sidebarUpdater = vi.fn();

    const states = {
      editorState: Object.assign(editorUpdater, {
        fileContents: {
          '/src/Button.js': 'import "./Button.css"; function Button() {}',
          '/src/Button.css': '.btn { color: red; }',
        },
        cursorPos: { '/src/Button.js': { index: 5 } },
      }),
      tabState: Object.assign(tabUpdater, { activeTabId: '/src/Button.js' }),
      sidebarState: sidebarUpdater,
    };

    toggleCssJsAction(asCtx(states));
    expect(tabUpdater).toHaveBeenCalled();
    expect(editorUpdater).toHaveBeenCalled();
  });

  it('navigateBackAction and navigateForwardAction traverse history stack', () => {
    const tabUpdater = vi.fn((cb) => cb({ openTabs: [] }));
    const editorUpdater = vi.fn((cb) => cb({ cursorPos: {}, navigationHistory: null }));

    const states = {
      editorState: Object.assign(editorUpdater, {
        fileContents: { '/a.js': 'a', '/b.js': 'b' },
        navigationHistory: {
          currentIndex: 1,
          stack: [
            { filePath: '/a.js', loc: { line: 1 } },
            { filePath: '/b.js', loc: { line: 2 } },
          ],
        },
      }),
      tabState: Object.assign(tabUpdater, { activeTabId: '/b.js' }),
    };

    navigateBackAction(asCtx(states));
    expect(tabUpdater).toHaveBeenCalled();

    states.editorState.navigationHistory.currentIndex = 0;
    navigateForwardAction(asCtx(states));
    expect(tabUpdater).toHaveBeenCalledTimes(2);
  });

  it('switchTabAction cycles active tab', () => {
    const tabUpdater = vi.fn((cb) => cb({ activeTabId: 'a.js' }));
    const tabState = Object.assign(tabUpdater, {
      openTabs: [{ id: 'a.js' }, { id: 'b.js' }],
      activeTabId: 'a.js',
    });

    switchTabAction(asCtx({ tabState }), 1);
    expect(tabUpdater).toHaveBeenCalled();
  });

  it('toggleCssJsAction toggles sidebar when no associated file exists', () => {
    const sidebarUpdater = vi.fn((cb) => cb({ isSidebarOpen: true }));
    const states = {
      editorState: {
        fileContents: { '/src/Only.js': 'export const x = 1;' },
        cursorPos: { '/src/Only.js': { index: 0 } },
      },
      tabState: { activeTabId: '/src/Only.js' },
      sidebarState: sidebarUpdater,
    };

    toggleCssJsAction(asCtx(states));
    expect(sidebarUpdater).toHaveBeenCalled();
  });

  it('toggleCssJsAction navigates from CSS to associated JS with class match', () => {
    const tabUpdater = vi.fn((cb) => cb({ openTabs: [] }));
    const editorUpdater = vi.fn((cb) => cb({ cursorPos: {}, shouldScrollTo: null }));
    const sidebarUpdater = vi.fn();

    const states = {
      editorState: Object.assign(editorUpdater, {
        fileContents: {
          '/src/Button.js': 'import "./Button.css"; function Button() {}',
          '/src/Button.css': '.btn { color: red; }\n.primary { color: blue; }',
        },
        cursorPos: { '/src/Button.css': { index: 1 } },
      }),
      tabState: Object.assign(tabUpdater, { activeTabId: '/src/Button.css', openTabs: [] }),
      sidebarState: sidebarUpdater,
    };

    toggleCssJsAction(asCtx(states));
    expect(tabUpdater).toHaveBeenCalled();
    expect(editorUpdater).toHaveBeenCalled();
    expect(sidebarUpdater).not.toHaveBeenCalled();
  });

  it('toggleCssJsAction opens existing tab without duplicating', () => {
    const capturedDraft = {
      openTabs: [{ id: '/src/Button.css' }],
      activeTabId: '/src/Button.js',
    };
    const tabUpdater = vi.fn((cb) => {
      cb(capturedDraft);
    });
    const editorUpdater = vi.fn((cb) => cb({ cursorPos: {}, shouldScrollTo: null }));

    const states = {
      editorState: Object.assign(editorUpdater, {
        fileContents: {
          '/src/Button.js': 'import "./Button.css";',
          '/src/Button.css': '.btn { color: red; }',
        },
        cursorPos: { '/src/Button.js': { index: 0 } },
      }),
      tabState: Object.assign(tabUpdater, {
        activeTabId: '/src/Button.js',
        openTabs: [{ id: '/src/Button.css' }],
      }),
      sidebarState: vi.fn(),
    };

    toggleCssJsAction(asCtx(states));
    expect(capturedDraft.openTabs).toHaveLength(1);
    expect(capturedDraft.activeTabId).toBe('/src/Button.css');
  });

  it('navigateBackAction does nothing at start of history', () => {
    const tabUpdater = vi.fn();
    const states = {
      editorState: {
        fileContents: { '/a.js': 'a' },
        navigationHistory: { currentIndex: 0, stack: [{ filePath: '/a.js', loc: { line: 1 } }] },
      },
      tabState: Object.assign(tabUpdater, { activeTabId: '/a.js', openTabs: [] }),
    };

    navigateBackAction(asCtx(states));
    expect(tabUpdater).not.toHaveBeenCalled();
  });

  it('navigateForwardAction does nothing at end of history', () => {
    const tabUpdater = vi.fn();
    const states = {
      editorState: {
        fileContents: { '/a.js': 'a', '/b.js': 'b' },
        navigationHistory: {
          currentIndex: 1,
          stack: [
            { filePath: '/a.js', loc: { line: 1 } },
            { filePath: '/b.js', loc: { line: 2 } },
          ],
        },
      },
      tabState: Object.assign(tabUpdater, { activeTabId: '/b.js', openTabs: [] }),
    };

    navigateForwardAction(asCtx(states));
    expect(tabUpdater).not.toHaveBeenCalled();
  });

  it('navigateBackAction does nothing when history is missing', () => {
    const tabUpdater = vi.fn();
    navigateBackAction(
      asCtx({
        editorState: { fileContents: {}, navigationHistory: null },
        tabState: Object.assign(tabUpdater, { openTabs: [] }),
      }),
    );
    expect(tabUpdater).not.toHaveBeenCalled();
  });

  it('switchTabAction wraps backward from first tab', () => {
    const capturedDraft = { activeTabId: 'a.js' };
    const tabUpdater = vi.fn((cb) => {
      cb(capturedDraft);
    });
    const tabState = Object.assign(tabUpdater, {
      openTabs: [{ id: 'a.js' }, { id: 'b.js' }, { id: 'c.js' }],
      activeTabId: 'a.js',
    });

    switchTabAction(asCtx({ tabState }), -1);
    expect(capturedDraft.activeTabId).toBe('c.js');
  });

  it('switchTabAction does nothing with fewer than two tabs', () => {
    const tabUpdater = vi.fn();
    switchTabAction(
      asCtx({
        tabState: Object.assign(tabUpdater, {
          openTabs: [{ id: 'only.js' }],
          activeTabId: 'only.js',
        }),
      }),
      1,
    );
    expect(tabUpdater).not.toHaveBeenCalled();
  });

  it('switchTabAction uses fallback when active tab is missing from openTabs', () => {
    const capturedDraft = { activeTabId: 'missing.js' };
    const tabUpdater = vi.fn((cb) => {
      cb(capturedDraft);
    });
    const tabState = Object.assign(tabUpdater, {
      openTabs: [{ id: 'a.js' }, { id: 'b.js' }],
      activeTabId: 'missing.js',
    });

    switchTabAction(asCtx({ tabState }), 1);
    expect(capturedDraft.activeTabId).toBe('a.js');
  });

  it('no-ops when required shortcut stores are missing', () => {
    const tabUpdater = vi.fn();
    toggleCssJsAction(asCtx({ editorState: null, tabState: null, sidebarState: null }));
    navigateBackAction(asCtx({ editorState: null, tabState: tabUpdater }));
    navigateForwardAction(asCtx({ editorState: null, tabState: tabUpdater }));
    switchTabAction(asCtx({ tabState: null }), 1);
    expect(tabUpdater).not.toHaveBeenCalled();
  });
});
