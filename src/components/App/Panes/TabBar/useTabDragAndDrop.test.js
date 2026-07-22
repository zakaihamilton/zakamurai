import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useTabDragAndDrop from './useTabDragAndDrop';

const createMockEvent = (tabId) => ({
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  dataTransfer: {
    setData: vi.fn(),
    getData: vi.fn(() => tabId),
    effectAllowed: '',
    dropEffect: '',
  },
});

describe('useTabDragAndDrop', () => {
  it('handleDragStart sets data transfer and updates ui state', () => {
    const tabBarUiState = vi.fn((fn) => fn({ draggedTabId: null }));
    const { result } = renderHook(() =>
      useTabDragAndDrop({
        tabState: vi.fn(),
        tabBarUiState,
        draggedTabId: null,
        resetDragState: vi.fn(),
      }),
    );

    const e = createMockEvent('tab1');
    act(() => result.current.handleDragStart(e, 'tab1'));

    expect(e.dataTransfer.setData).toHaveBeenCalledWith('tabId', 'tab1');
    expect(e.dataTransfer.effectAllowed).toBe('move');
    expect(tabBarUiState).toHaveBeenCalled();
  });

  it('handleDrop reorders tabs', () => {
    const draft = {
      openTabs: [
        { id: 'tab1', label: 'Tab 1' },
        { id: 'tab2', label: 'Tab 2' },
        { id: 'tab3', label: 'Tab 3' },
      ],
    };
    const tabState = vi.fn((fn) => fn(draft));
    const resetDragState = vi.fn();
    const { result } = renderHook(() =>
      useTabDragAndDrop({
        tabState,
        tabBarUiState: vi.fn(),
        draggedTabId: 'tab1',
        resetDragState,
      }),
    );

    const e = createMockEvent('tab1');
    act(() => result.current.handleDrop(e, 'tab3'));

    expect(draft.openTabs.map((t) => t.id)).toEqual(['tab2', 'tab3', 'tab1']);
    expect(resetDragState).toHaveBeenCalled();
  });

  it('handleDrop no-ops when dragged equals target', () => {
    const tabState = vi.fn();
    const resetDragState = vi.fn();
    const { result } = renderHook(() =>
      useTabDragAndDrop({
        tabState,
        tabBarUiState: vi.fn(),
        draggedTabId: 'tab1',
        resetDragState,
      }),
    );

    const e = createMockEvent('tab1');
    act(() => result.current.handleDrop(e, 'tab1'));

    expect(tabState).not.toHaveBeenCalled();
    expect(resetDragState).toHaveBeenCalled();
  });

  it('handleDropOnBar moves tab to end', () => {
    const draft = {
      openTabs: [
        { id: 'tab1', label: 'Tab 1' },
        { id: 'tab2', label: 'Tab 2' },
      ],
    };
    const tabState = vi.fn((fn) => fn(draft));
    const resetDragState = vi.fn();
    const { result } = renderHook(() =>
      useTabDragAndDrop({
        tabState,
        tabBarUiState: vi.fn(),
        draggedTabId: 'tab1',
        resetDragState,
      }),
    );

    const e = createMockEvent('tab1');
    act(() => result.current.handleDropOnBar(e));

    expect(draft.openTabs.map((t) => t.id)).toEqual(['tab2', 'tab1']);
    expect(resetDragState).toHaveBeenCalled();
  });

  it('handleDragEnd resets drag state', () => {
    const resetDragState = vi.fn();
    const { result } = renderHook(() =>
      useTabDragAndDrop({
        tabState: vi.fn(),
        tabBarUiState: vi.fn(),
        draggedTabId: 'tab1',
        resetDragState,
      }),
    );

    act(() => result.current.handleDragEnd());
    expect(resetDragState).toHaveBeenCalled();
  });
});
