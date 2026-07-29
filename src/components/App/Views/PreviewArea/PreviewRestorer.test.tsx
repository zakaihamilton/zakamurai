import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { PreviewState } from '@/components/App/PreviewState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { useFileSystem } from '@/components/Storage';
import { asMockUseFileSystem } from '@/test-utils/fsMocks';
import { createMockEditorState } from '@/test-utils/editorMocks';
import { makeAppState, makePreviewState, makeSidebarState } from '@/test-utils/stateMocks';
import { Compiler } from '@/utils/compiler';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreviewRestorer } from './PreviewRestorer';

const mockVfs = {
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
};

const mockCompilerInstance = {
  init: vi.fn().mockResolvedValue({ vfs: mockVfs }),
  syncFiles: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/utils/compiler', () => {
  return {
    Compiler: vi.fn(() => mockCompilerInstance),
  };
});

vi.mock('@/components/App/PreviewState', () => ({
  PreviewState: { useState: vi.fn() },
}));

vi.mock('@/components/Storage', () => ({
  useFileSystem: vi.fn(() => ({ isReady: true })),
}));
vi.mock('@/components/App/AppState', () => ({
  AppState: { useState: vi.fn() },
}));

vi.mock('@/components/App/Panes/Sidebar', () => ({
  SidebarState: { useState: vi.fn() },
}));

vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: { useState: vi.fn() },
}));

describe('usePreviewRestorer', () => {
  let previewStateMock: ReturnType<typeof makePreviewState>;
  let appStateMock: ReturnType<typeof makeAppState>;

  beforeEach(() => {
    vi.clearAllMocks();

    previewStateMock = makePreviewState({
      htmlContent: '<html></html>',
      isCompilerReady: false,
      restoreError: null,
      previewAddress: '/preview/dist/index.html',
    });
    appStateMock = makeAppState({ silentCompileRequest: 0 });

    vi.mocked(PreviewState.useState).mockReturnValue(previewStateMock);
    vi.mocked(AppState.useState).mockReturnValue(appStateMock);
    vi.mocked(useFileSystem).mockReturnValue(asMockUseFileSystem({ isReady: true }));
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState({ folderTree: [] }));
    vi.mocked(EditorState.useState).mockReturnValue(createMockEditorState());
    mockVfs.readdirSync.mockReturnValue([]);
  });

  it('triggers silent recompile when dist assets are missing', async () => {
    mockVfs.existsSync.mockReturnValue(false);

    renderHook(() => usePreviewRestorer());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Compiler).toHaveBeenCalled();
    expect(mockCompilerInstance.init).toHaveBeenCalled();
    expect(mockVfs.mkdirSync).toHaveBeenCalledWith('/dist', { recursive: true });
    expect(mockVfs.writeFileSync).toHaveBeenCalledWith('/dist/index.html', '<html></html>');
    expect(mockVfs.writeFileSync).toHaveBeenCalledWith('/index.html', '<html></html>');
    expect(mockCompilerInstance.syncFiles).toHaveBeenCalled();
    expect(appStateMock.silentCompileRequest).toBe(1);
    expect(previewStateMock.isCompilerReady).toBe(false);
  });

  it('marks ready when dist assets already exist', async () => {
    mockVfs.existsSync.mockReturnValue(true);
    mockVfs.readdirSync.mockReturnValue(['assets', 'index.html']);

    renderHook(() => usePreviewRestorer());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(appStateMock.silentCompileRequest).toBe(0);
    expect(previewStateMock.isCompilerReady).toBe(true);
    expect(previewStateMock.previewAddress).toBe('/preview/dist/index.html');
  });

  it('handles restore error gracefully', async () => {
    const err = new Error('Init compilation failed');
    mockCompilerInstance.init.mockRejectedValue(err);

    renderHook(() => usePreviewRestorer());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(previewStateMock.restoreError).toBe('Init compilation failed');
    expect(previewStateMock.isCompilerReady).toBe(true);
  });
});
