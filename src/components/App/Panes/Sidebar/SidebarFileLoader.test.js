import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useSidebarFileLoader from './SidebarFileLoader';

describe('useSidebarFileLoader', () => {
  it('initializes correctly and returns all handlers', () => {
    const mockFs = { mode: 'local' };
    const mockAppState = { isMobile: false };
    const mockSidebarState = vi.fn();
    const mockTabState = vi.fn();
    const mockEditorState = vi.fn();
    const mockSetLoadingPaths = vi.fn();
    const mockAddNotification = vi.fn();

    const { result } = renderHook(() =>
      useSidebarFileLoader({
        fs: mockFs,
        appState: mockAppState,
        sidebarState: mockSidebarState,
        tabState: mockTabState,
        editorState: mockEditorState,
        setLoadingPaths: mockSetLoadingPaths,
        addNotification: mockAddNotification,
      }),
    );

    expect(result.current.loadChildren).toBeTypeOf('function');
    expect(result.current.handleToggle).toBeTypeOf('function');
    expect(result.current.handleOpenFile).toBeTypeOf('function');
    expect(result.current.handleRename).toBeTypeOf('function');
    expect(result.current.handleCreate).toBeTypeOf('function');
    expect(result.current.handleDelete).toBeTypeOf('function');
  });
});
