import { mockDragEvent } from '@/test-utils/domMocks';
import { createMockTab, createMockTabState } from '@/test-utils/editorMocks';
import { createMockStateStore } from '@/test-utils/stateMocks';
import type { TabBarUiStateShape, TabStateShape } from '@/types/domain-types';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useTabDragAndDrop from './useTabDragAndDrop';

function makeTabBarUiState(overrides: Partial<TabBarUiStateShape> = {}) {
  return createMockStateStore<TabBarUiStateShape>({
    draggedTabId: null,
    dropTargetId: null,
    isOverBar: false,
    ...overrides,
  });
}

function createMockDragEvent(tabId: string) {
  return mockDragEvent({
    dataTransfer: {
      setData: vi.fn(),
      getData: vi.fn(() => tabId),
      effectAllowed: 'all',
      dropEffect: 'none',
    },
  });
}

describe('useTabDragAndDrop', () => {
  it('handleDragStart sets data transfer and updates ui state', () => {
    const tabBarUiState = makeTabBarUiState({ draggedTabId: null });
    const { result } = renderHook(() =>
      useTabDragAndDrop({
        tabState: createMockTabState(),
        tabBarUiState,
        draggedTabId: null,
        resetDragState: vi.fn(),
      }),
    );

    const e = createMockDragEvent('tab1');
    act(() => result.current.handleDragStart(e, 'tab1'));

    expect(e.dataTransfer.setData).toHaveBeenCalledWith('tabId', 'tab1');
    expect(e.dataTransfer.effectAllowed).toBe('move');
    expect(tabBarUiState).toHaveBeenCalled();
  });

  it('handleDrop reorders tabs', () => {
    const draft: TabStateShape = {
      openTabs: [
        createMockTab({
          id: 'tab1',
          label: 'Tab 1',
          type: 'file',
          file: { name: 'tab1.js', path: ['tab1.js'] },
        }),
        createMockTab({
          id: 'tab2',
          label: 'Tab 2',
          type: 'file',
          file: { name: 'tab2.js', path: ['tab2.js'] },
        }),
        createMockTab({
          id: 'tab3',
          label: 'Tab 3',
          type: 'file',
          file: { name: 'tab3.js', path: ['tab3.js'] },
        }),
      ],
      activeTabId: 'tab1',
      lastCodeTabId: 'tab1',
    };
    const tabState = createMockTabState(draft);
    const resetDragState = vi.fn();
    const { result } = renderHook(() =>
      useTabDragAndDrop({
        tabState,
        tabBarUiState: makeTabBarUiState(),
        draggedTabId: 'tab1',
        resetDragState,
      }),
    );

    const e = createMockDragEvent('tab1');
    act(() => result.current.handleDrop(e, 'tab3'));

    expect(tabState.openTabs.map((t) => t.id)).toEqual(['tab2', 'tab3', 'tab1']);
    expect(resetDragState).toHaveBeenCalled();
  });

  it('handleDrop no-ops when dragged equals target', () => {
    const tabState = createMockTabState();
    const resetDragState = vi.fn();
    const { result } = renderHook(() =>
      useTabDragAndDrop({
        tabState,
        tabBarUiState: makeTabBarUiState(),
        draggedTabId: 'tab1',
        resetDragState,
      }),
    );

    const e = createMockDragEvent('tab1');
    act(() => result.current.handleDrop(e, 'tab1'));

    expect(tabState).not.toHaveBeenCalled();
    expect(resetDragState).toHaveBeenCalled();
  });

  it('handleDropOnBar moves tab to end', () => {
    const draft: TabStateShape = {
      openTabs: [
        createMockTab({
          id: 'tab1',
          label: 'Tab 1',
          type: 'file',
          file: { name: 'tab1.js', path: ['tab1.js'] },
        }),
        createMockTab({
          id: 'tab2',
          label: 'Tab 2',
          type: 'file',
          file: { name: 'tab2.js', path: ['tab2.js'] },
        }),
      ],
      activeTabId: 'tab1',
      lastCodeTabId: 'tab1',
    };
    const tabState = createMockTabState(draft);
    const resetDragState = vi.fn();
    const { result } = renderHook(() =>
      useTabDragAndDrop({
        tabState,
        tabBarUiState: makeTabBarUiState(),
        draggedTabId: 'tab1',
        resetDragState,
      }),
    );

    const e = createMockDragEvent('tab1');
    act(() => result.current.handleDropOnBar(e));

    expect(tabState.openTabs.map((t) => t.id)).toEqual(['tab2', 'tab1']);
    expect(resetDragState).toHaveBeenCalled();
  });

  it('handleDragEnd resets drag state', () => {
    const resetDragState = vi.fn();
    const { result } = renderHook(() =>
      useTabDragAndDrop({
        tabState: createMockTabState(),
        tabBarUiState: makeTabBarUiState(),
        draggedTabId: 'tab1',
        resetDragState,
      }),
    );

    act(() => result.current.handleDragEnd());
    expect(resetDragState).toHaveBeenCalled();
  });
});
