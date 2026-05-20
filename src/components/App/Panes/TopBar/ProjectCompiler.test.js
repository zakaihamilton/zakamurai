import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useProjectCompiler from './ProjectCompiler';

vi.mock('@/components/Widgets/Notification/Notification', () => ({
  useNotification: () => ({
    addNotification: vi.fn(),
  }),
}));

describe('useProjectCompiler', () => {
  it('returns compilation control functions', () => {
    const mockAppState = { compileRequest: 0, silentCompileRequest: 0 };
    const mockTabState = vi.fn();
    const mockSidebarState = { folderTree: [] };
    const mockEditorState = { fileContents: {} };
    const mockLogState = vi.fn();
    const mockPreviewState = vi.fn();

    const { result } = renderHook(() =>
      useProjectCompiler(
        mockAppState,
        mockTabState,
        mockSidebarState,
        mockEditorState,
        mockLogState,
        mockPreviewState,
        false,
      ),
    );

    expect(result.current.handleCompile).toBeTypeOf('function');
    expect(result.current.handleOpenLog).toBeTypeOf('function');
    expect(result.current.handleOpenPreview).toBeTypeOf('function');
    expect(result.current.handleClearFS).toBeTypeOf('function');
  });

  it('triggers log sync layout requests', () => {
    const mockAppState = { compileRequest: 0, silentCompileRequest: 0 };
    const mockTabState = vi.fn();
    const mockSidebarState = { folderTree: [] };
    const mockEditorState = { fileContents: {} };
    const mockLogState = vi.fn();
    const mockPreviewState = vi.fn();

    const { result } = renderHook(() =>
      useProjectCompiler(
        mockAppState,
        mockTabState,
        mockSidebarState,
        mockEditorState,
        mockLogState,
        mockPreviewState,
        false,
      ),
    );

    act(() => {
      result.current.handleOpenLog();
    });

    expect(mockTabState).toHaveBeenCalled();
  });
});
