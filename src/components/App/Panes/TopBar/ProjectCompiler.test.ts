import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { PreviewState } from '@/components/App/PreviewState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import { useFileSystem } from '@/components/Storage';
import { createMockEditorState } from '@/test-utils/editorMocks';
import { asMockUseFileSystem } from '@/test-utils/fsMocks';
import {
  makeAppState,
  makeLogState,
  makePreviewState,
  makeSidebarState,
  makeTabState,
} from '@/test-utils/stateMocks';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useProjectCompiler from './ProjectCompiler';

const addNotification = vi.fn();
const compilerReset = vi.fn();

vi.mock('@/components/ui/Notification', () => ({
  useNotification: () => ({
    addNotification,
  }),
}));

vi.mock('@/components/Storage', () => ({
  useFileSystem: vi.fn(() => ({ mode: null, rootHandle: null })),
}));

vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(() => ({ compileRequest: 0, silentCompileRequest: 0 })),
  },
}));

vi.mock('@/components/App/Panes/TabBar', () => ({
  TabState: {
    usePassiveState: vi.fn(() => Object.assign(vi.fn(), { activeTabId: null, openTabs: [] })),
  },
}));

vi.mock('@/components/App/Panes/Sidebar', () => ({
  SidebarState: {
    useState: vi.fn(() => ({ folderTree: [] })),
  },
}));

vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: {
    usePassiveState: vi.fn(() => ({ fileContents: {} })),
  },
}));

vi.mock('@/components/App/Views/LogArea', () => ({
  LogState: {
    usePassiveState: vi.fn(() => vi.fn()),
    useState: vi.fn(() => ({ isSystemProcessing: false })),
  },
}));

vi.mock('@/components/App/PreviewState', () => ({
  PreviewState: {
    usePassiveState: vi.fn(() => vi.fn()),
  },
}));

vi.mock('@/utils/compiler', () => ({
  Compiler: {
    reset: (...args: unknown[]) => compilerReset(...args),
  },
}));

function renderCompilerHook() {
  const mockLogState = makeLogState();
  const mockPreviewState = makePreviewState();
  const mockTabState = makeTabState();
  vi.mocked(LogState.usePassiveState).mockReturnValue(mockLogState);
  vi.mocked(PreviewState.usePassiveState).mockReturnValue(mockPreviewState);
  vi.mocked(TabState.usePassiveState).mockReturnValue(mockTabState);
  vi.mocked(useFileSystem).mockReturnValue(asMockUseFileSystem());
  vi.mocked(AppState.useState).mockReturnValue(makeAppState());
  vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState());
  vi.mocked(EditorState.usePassiveState).mockReturnValue(createMockEditorState());
  vi.mocked(LogState.useState).mockReturnValue(makeLogState({ isSystemProcessing: false }));

  const rendered = renderHook(() => useProjectCompiler());
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
    expect(mockLogState).toHaveBeenCalled();
    const logUpdater = mockLogState.mock.calls.at(-1)?.[0];
    expect(logUpdater).toBeTypeOf('function');
    const draft = { logs: [] as Array<{ text: string }> };
    logUpdater?.(draft);
    expect(draft.logs.at(-1)?.text).toBe(
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
    const logUpdater = mockLogState.mock.calls.at(-1)?.[0];
    expect(logUpdater).toBeTypeOf('function');
    const draft = { logs: [] as Array<{ text: string }> };
    logUpdater?.(draft);
    expect(draft.logs.at(-1)?.text).toBe('Failed to clear filesystem: OPFS locked');
  });
});
