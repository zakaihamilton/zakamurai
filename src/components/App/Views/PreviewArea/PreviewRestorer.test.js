import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { PreviewState } from '@/components/App/PreviewState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { Compiler } from '@/utils/compiler';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreviewRestorer } from './PreviewRestorer';

const mockVfs = {
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
};

const mockCompilerInstance = {
  init: vi.fn().mockResolvedValue({ vfs: mockVfs }),
  syncFiles: vi.fn().mockResolvedValue(),
};

vi.mock('@/utils/compiler', () => {
  return {
    Compiler: vi.fn(() => mockCompilerInstance),
  };
});

vi.mock('@/components/App/PreviewState', () => ({
  PreviewState: { useState: vi.fn() },
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
  let previewStateMock;

  beforeEach(() => {
    vi.clearAllMocks();

    const stateObj = { isCompilerReady: false, restoreError: null };
    previewStateMock = vi.fn((cb) => {
      cb(stateObj);
      previewStateMock.isCompilerReady = stateObj.isCompilerReady;
      previewStateMock.restoreError = stateObj.restoreError;
    });
    previewStateMock.htmlContent = '<html></html>';
    previewStateMock.isCompilerReady = false;
    previewStateMock.restoreError = null;

    PreviewState.useState.mockReturnValue(previewStateMock);
    AppState.useState.mockReturnValue({ fs: { isReady: true } });
    SidebarState.useState.mockReturnValue({ folderTree: [] });
    EditorState.useState.mockReturnValue({ fileContents: {} });
  });

  it('restores html content and initializes compiler', async () => {
    mockVfs.existsSync.mockReturnValue(false);

    renderHook(() => usePreviewRestorer());

    // Flush promises
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
    expect(previewStateMock.isCompilerReady).toBe(true);
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

  it('marks ready instantly if htmlContent is empty', async () => {
    previewStateMock.htmlContent = '';

    renderHook(() => usePreviewRestorer());

    await act(async () => {
      await Promise.resolve();
    });

    expect(Compiler).not.toHaveBeenCalled();
    expect(previewStateMock.isCompilerReady).toBe(true);
  });
});
