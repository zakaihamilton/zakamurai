import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useProjectCompiler from './ProjectCompiler';

const addNotification = vi.fn();
const setPreviewHtml = vi.fn();
const compilerReset = vi.fn();

vi.mock('@/components/ui/Notification', () => ({
  useNotification: () => ({
    addNotification,
  }),
}));

vi.mock('@/components/Storage/Settings', () => ({
  default: {
    setPreviewHtml: (...args) => setPreviewHtml(...args),
  },
}));

vi.mock('@/utils/compiler', () => ({
  Compiler: {
    reset: (...args) => compilerReset(...args),
  },
}));

function renderCompilerHook() {
  const mockAppState = { compileRequest: 0, silentCompileRequest: 0 };
  const mockTabState = Object.assign(vi.fn(), { activeTabId: null });
  const mockSidebarState = { folderTree: [] };
  const mockEditorState = { fileContents: {} };
  const mockLogState = vi.fn();
  const mockPreviewState = vi.fn();

  const rendered = renderHook(() =>
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

  return { ...rendered, mockTabState, mockLogState, mockPreviewState };
}

describe('useProjectCompiler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    compilerReset.mockResolvedValue(undefined);
  });

  it('returns compilation control functions', () => {
    const { result } = renderCompilerHook();

    expect(result.current.handleCompile).toBeTypeOf('function');
    expect(result.current.handleOpenLog).toBeTypeOf('function');
    expect(result.current.handleOpenPreview).toBeTypeOf('function');
    expect(result.current.handleClearFS).toBeTypeOf('function');
  });

  it('triggers log sync layout requests', () => {
    const { result, mockTabState } = renderCompilerHook();

    act(() => {
      result.current.handleOpenLog();
    });

    expect(mockTabState).toHaveBeenCalled();
  });

  it('clears the filesystem and logs success', async () => {
    const { result, mockPreviewState, mockLogState, mockTabState } = renderCompilerHook();

    await act(async () => {
      await result.current.handleClearFS();
    });

    expect(compilerReset).toHaveBeenCalled();
    expect(mockPreviewState).toHaveBeenCalled();
    expect(setPreviewHtml).toHaveBeenCalledWith(null);
    expect(mockLogState).toHaveBeenCalled();
    const logUpdater = mockLogState.mock.calls.at(-1)[0];
    const draft = { logs: [] };
    logUpdater(draft);
    expect(draft.logs.at(-1).text).toBe(
      'Virtual filesystem cleared. Next compile will start fresh.',
    );
    expect(mockTabState).toHaveBeenCalled();
    expect(addNotification).not.toHaveBeenCalledWith(expect.anything(), 'error');
  });

  it('notifies and logs on clear filesystem failure without throwing', async () => {
    compilerReset.mockRejectedValue(new Error('OPFS locked'));
    const { result, mockLogState } = renderCompilerHook();

    await act(async () => {
      await expect(result.current.handleClearFS()).resolves.toBeUndefined();
    });

    expect(addNotification).toHaveBeenCalledWith(
      'Failed to clear filesystem: OPFS locked',
      'error',
    );
    expect(mockLogState).toHaveBeenCalled();
    const logUpdater = mockLogState.mock.calls.at(-1)[0];
    const draft = { logs: [] };
    logUpdater(draft);
    expect(draft.logs.at(-1).text).toBe('Failed to clear filesystem: OPFS locked');
    expect(setPreviewHtml).not.toHaveBeenCalled();
  });
});
