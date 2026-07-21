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
    state = Object.assign(
      vi.fn((updater) => {
        const draft = {
          fileContents: { ...(state.fileContents || {}) },
          cursorPos: { ...(state.cursorPos || {}) },
          shouldScrollTo: state.shouldScrollTo,
          navigationHistory: state.navigationHistory || { stack: [], currentIndex: -1 },
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
});
