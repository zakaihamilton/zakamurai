import { describe, expect, it, vi } from 'vitest';
import {
  navigateBackAction,
  navigateForwardAction,
  switchTabAction,
  toggleCssJsAction,
} from './actions';

describe('shortcuts/actions', () => {
  it('toggleCssJsAction toggles sidebar when no active tab or unsupported file type', () => {
    const sidebarUpdater = vi.fn((cb) => cb({ isSidebarOpen: false }));
    const states = {
      editorState: { fileContents: {}, cursorPos: {} },
      tabState: { activeTabId: null },
      sidebarState: sidebarUpdater,
    };

    toggleCssJsAction(states);
    expect(sidebarUpdater).toHaveBeenCalled();

    const statesTxt = {
      editorState: { fileContents: {}, cursorPos: {} },
      tabState: { activeTabId: 'readme.txt' },
      sidebarState: sidebarUpdater,
    };
    toggleCssJsAction(statesTxt);
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

    toggleCssJsAction(states);
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

    navigateBackAction(states);
    expect(tabUpdater).toHaveBeenCalled();

    states.editorState.navigationHistory.currentIndex = 0;
    navigateForwardAction(states);
    expect(tabUpdater).toHaveBeenCalledTimes(2);
  });

  it('switchTabAction cycles active tab', () => {
    const tabUpdater = vi.fn((cb) => cb({ activeTabId: 'a.js' }));
    const tabState = Object.assign(tabUpdater, {
      openTabs: [{ id: 'a.js' }, { id: 'b.js' }],
      activeTabId: 'a.js',
    });

    switchTabAction({ tabState }, 1);
    expect(tabUpdater).toHaveBeenCalled();
  });
});
