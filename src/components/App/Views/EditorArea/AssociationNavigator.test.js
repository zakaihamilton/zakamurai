import {
  findClassInCss,
  findClassReferenceInJs,
  getAssociatedFilePath,
  getStyleAtCursor,
} from '@/utils/navigation';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useAssociationNavigator from './AssociationNavigator';

vi.mock('@/utils/navigation', () => ({
  getAssociatedFilePath: vi.fn(() => 'src/App.module.css'),
  getStyleAtCursor: vi.fn(() => 'card'),
  findClassInCss: vi.fn(() => ({ line: 4, col: 1, index: 20 })),
  findClassReferenceInJs: vi.fn(() => ({ line: 2, col: 1, index: 10 })),
}));

describe('useAssociationNavigator', () => {
  let state;
  let tabState;
  let shouldScrollRef;
  let localContentRef;

  beforeEach(() => {
    vi.clearAllMocks();
    getAssociatedFilePath.mockReturnValue('src/App.module.css');
    getStyleAtCursor.mockReturnValue('card');
    findClassInCss.mockReturnValue({ line: 4, col: 1, index: 20 });
    findClassReferenceInJs.mockReturnValue({ line: 2, col: 1, index: 10 });

    state = Object.assign(
      vi.fn((updater) => {
        const draft = {
          fileContents: { ...(state.fileContents || {}) },
          cursorPos: { ...(state.cursorPos || {}) },
          shouldScrollTo: state.shouldScrollTo,
          navigationHistory: state.navigationHistory
            ? {
                stack: [...(state.navigationHistory.stack || [])],
                currentIndex: state.navigationHistory.currentIndex,
              }
            : { stack: [], currentIndex: -1 },
        };
        updater(draft);
        Object.assign(state, draft);
      }),
      {
        fileContents: {
          'src/App.jsx': 'const x = styles.card;',
          'src/App.module.css': '.card { color: red; }',
        },
        cursorPos: {},
        navigationHistory: { stack: [], currentIndex: -1 },
      },
    );
    tabState = Object.assign(
      vi.fn((updater) => {
        const draft = {
          openTabs: [...tabState.openTabs],
          activeTabId: tabState.activeTabId,
        };
        updater(draft);
        Object.assign(tabState, draft);
      }),
      {
        openTabs: [{ id: 'src/App.jsx', type: 'file' }],
        activeTabId: 'src/App.jsx',
      },
    );
    shouldScrollRef = { current: null };
    localContentRef = { current: 'const x = styles.card;' };
  });

  it('resolves the associated path and navigates to the matching class', () => {
    const { result } = renderHook(() =>
      useAssociationNavigator({
        filePath: 'src/App.jsx',
        cursorPos: { line: 1, col: 18, index: 17 },
        localContentRef,
        state,
        tabState,
        shouldScrollRef,
      }),
    );

    expect(result.current.associatedPath).toBe('src/App.module.css');

    act(() => {
      result.current.handleNavigateToAssociated();
    });

    expect(tabState.activeTabId).toBe('src/App.module.css');
    expect(tabState.openTabs.some((tab) => tab.id === 'src/App.module.css')).toBe(true);
    expect(state.cursorPos['src/App.module.css']).toEqual({ line: 4, col: 1, index: 20 });
    expect(shouldScrollRef.current).toEqual({
      filePath: 'src/App.module.css',
      line: 4,
    });
    expect(state.navigationHistory.stack.length).toBeGreaterThanOrEqual(1);
  });

  it('jumps directly to a provided target location', () => {
    const { result } = renderHook(() =>
      useAssociationNavigator({
        filePath: 'src/App.jsx',
        cursorPos: { line: 1, col: 1, index: 0 },
        localContentRef,
        state,
        tabState,
        shouldScrollRef,
      }),
    );

    act(() => {
      result.current.handleJumpToTarget('src/App.module.css', { line: 8, col: 2, index: 30 });
    });

    expect(tabState.activeTabId).toBe('src/App.module.css');
    expect(state.cursorPos['src/App.module.css']).toEqual({ line: 8, col: 2, index: 30 });
    expect(shouldScrollRef.current.line).toBe(8);
  });

  it('navigates from CSS to JS and uses object style results', () => {
    getStyleAtCursor.mockReturnValue({ className: 'card', identifier: 'styles' });
    getAssociatedFilePath.mockImplementation((_path, _files, identifier) =>
      identifier ? 'src/Theme.module.css' : 'src/App.jsx',
    );
    findClassReferenceInJs.mockReturnValue(null);
    localContentRef.current = '.card { color: red; }';

    const { result } = renderHook(() =>
      useAssociationNavigator({
        filePath: 'src/App.module.css',
        cursorPos: { line: 1, col: 2 },
        localContentRef,
        state,
        tabState,
        shouldScrollRef,
      }),
    );

    act(() => {
      result.current.handleNavigateToAssociated();
    });

    expect(tabState.activeTabId).toBe('src/App.jsx');
    expect(state.cursorPos['src/App.jsx']).toEqual({ line: 1, col: 1, index: 0 });
  });

  it('no-ops when there is no associated path or jump target', () => {
    getAssociatedFilePath.mockReturnValue(null);
    const { result } = renderHook(() =>
      useAssociationNavigator({
        filePath: 'src/App.jsx',
        cursorPos: null,
        localContentRef: { current: null },
        state,
        tabState,
        shouldScrollRef,
      }),
    );

    act(() => {
      result.current.handleNavigateToAssociated();
      result.current.handleJumpToTarget(null, { line: 1 });
      result.current.handleJumpToTarget('src/App.module.css', null);
    });

    expect(tabState.activeTabId).toBe('src/App.jsx');
  });

  it('reuses open tabs and trims navigation history after mid-stack jumps', () => {
    tabState.openTabs = [
      { id: 'src/App.jsx', type: 'file' },
      { id: 'src/App.module.css', type: 'file' },
    ];
    state.navigationHistory = {
      stack: [
        { filePath: 'src/App.jsx', loc: { line: 1, col: 1, index: 0 }, label: 'App.jsx' },
        { filePath: 'src/Other.jsx', loc: { line: 2, col: 1, index: 0 }, label: 'Other.jsx' },
        { filePath: 'src/Far.jsx', loc: { line: 3, col: 1, index: 0 }, label: 'Far.jsx' },
      ],
      currentIndex: 0,
    };

    const { result } = renderHook(() =>
      useAssociationNavigator({
        filePath: 'src/App.jsx',
        cursorPos: { line: 1, col: 1, index: 0 },
        localContentRef,
        state,
        tabState,
        shouldScrollRef,
      }),
    );

    act(() => {
      result.current.handleJumpToTarget('src/App.module.css', { line: 8 });
    });

    expect(tabState.openTabs.filter((tab) => tab.id === 'src/App.module.css')).toHaveLength(1);
    expect(state.navigationHistory.stack.length).toBeLessThanOrEqual(3);
    expect(state.cursorPos['src/App.module.css']).toEqual({ line: 8 });
  });
});
