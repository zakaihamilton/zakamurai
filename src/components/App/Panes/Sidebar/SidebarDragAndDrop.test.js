import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useSidebarDragAndDrop from './SidebarDragAndDrop';

describe('useSidebarDragAndDrop', () => {
  it('initializes correctly and returns standard drag handlers', () => {
    const mockFs = { mode: 'local' };
    const mockSidebarState = vi.fn();
    const mockSetDropTargetPath = vi.fn();

    const { result } = renderHook(() =>
      useSidebarDragAndDrop({
        fs: mockFs,
        sidebarState: mockSidebarState,
        setDropTargetPath: mockSetDropTargetPath,
      }),
    );

    expect(result.current.handleDragStart).toBeTypeOf('function');
    expect(result.current.handleDragOver).toBeTypeOf('function');
    expect(result.current.handleDragEnter).toBeTypeOf('function');
    expect(result.current.handleDrop).toBeTypeOf('function');
  });
});
