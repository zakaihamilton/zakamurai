import { act, renderHook } from '@testing-library/react';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fingerprintContents, useRagIndexer } from './RagIndexer';

const ragSearch = {
  init: vi.fn(),
  indexWorkspaceFiles: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/utils/rag/search-utility', () => {
  return {
    ragSearch: {
      init: (...args: unknown[]) => ragSearch.init(...args),
      indexWorkspaceFiles: (...args: unknown[]) => ragSearch.indexWorkspaceFiles(...args),
    },
  };
});

const collectWorkspaceFiles = vi.fn().mockResolvedValue({});

vi.mock('@/components/AI/Agent/Snapshot', () => ({
  collectWorkspaceFiles: (...args: unknown[]) => collectWorkspaceFiles(...args),
}));

vi.mock('@/components/Storage', () => ({
  useFileSystem: vi.fn(),
}));

vi.mock('@/components/AI/RagState', () => ({
  RagState: {
    useState: vi.fn(() => Object.assign(vi.fn(), { status: 'idle' })),
  },
}));

vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: {
    useState: vi.fn(),
  },
}));

import { RagState } from '@/components/AI/RagState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { useFileSystem } from '@/components/Storage';

const mockUseFileSystem = vi.mocked(useFileSystem);
const mockEditorState = vi.mocked(EditorState.useState);
const mockRagState = vi.mocked(RagState.useState);

describe('useRagIndexer', () => {
  let consoleLogSpy: Mock;
  let consoleErrorSpy: Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {}) as Mock;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) as Mock;
    mockUseFileSystem.mockReturnValue({ isReady: true } as never);
    mockEditorState.mockReturnValue({ fileContents: {} } as never);
    mockRagState.mockReturnValue(Object.assign(vi.fn(), { status: 'idle' }) as never);
    ragSearch.init.mockResolvedValue(undefined);
    ragSearch.indexWorkspaceFiles.mockResolvedValue(undefined);
    collectWorkspaceFiles.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('initializes the RAG indexer when FS is ready', async () => {
    renderHook(() => useRagIndexer());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(ragSearch.init).toHaveBeenCalled();
    expect(collectWorkspaceFiles).toHaveBeenCalled();
    expect(ragSearch.indexWorkspaceFiles).toHaveBeenCalled();
  });

  it('debounces reindexing when file contents change', async () => {
    const { rerender } = renderHook(() => useRagIndexer());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    ragSearch.indexWorkspaceFiles.mockClear();
    mockEditorState.mockReturnValue({ fileContents: { 'a.js': 'hi' } } as never);
    rerender();

    await act(async () => {
      vi.advanceTimersByTime(1600);
      await Promise.resolve();
    });

    expect(ragSearch.indexWorkspaceFiles).toHaveBeenCalled();
  });

  it('logs initialization failures', async () => {
    ragSearch.init.mockRejectedValue(new Error('boom'));
    renderHook(() => useRagIndexer());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('does not initialize without writable RAG state', async () => {
    mockRagState.mockReturnValue(undefined as never);

    renderHook(() => useRagIndexer());
    await act(async () => {
      await Promise.resolve();
    });

    expect(ragSearch.init).not.toHaveBeenCalled();
  });

  it('waits for the filesystem before collecting workspace files', async () => {
    mockUseFileSystem.mockReturnValue({ isReady: false } as never);

    renderHook(() => useRagIndexer());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(ragSearch.init).toHaveBeenCalled();
    expect(collectWorkspaceFiles).not.toHaveBeenCalled();
  });

  it('does not bootstrap after the hook is unmounted during initialization', async () => {
    let resolveInitialization = () => {};
    ragSearch.init.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveInitialization = resolve;
        }),
    );
    const { unmount } = renderHook(() => useRagIndexer());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    unmount();
    await act(async () => {
      resolveInitialization();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(collectWorkspaceFiles).not.toHaveBeenCalled();
  });

  it('does not index files collected after the hook is unmounted', async () => {
    let resolveCollection = (_files: Record<string, string>) => {};
    collectWorkspaceFiles.mockImplementation(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          resolveCollection = resolve;
        }),
    );
    const { unmount } = renderHook(() => useRagIndexer());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    unmount();
    await act(async () => {
      resolveCollection({ 'a.js': 'late' });
      await Promise.resolve();
    });

    expect(ragSearch.indexWorkspaceFiles).not.toHaveBeenCalled();
  });

  it('uses an empty editor snapshot when bootstrapping without file contents', async () => {
    mockEditorState.mockReturnValue({ fileContents: undefined } as never);

    renderHook(() => useRagIndexer());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(collectWorkspaceFiles).toHaveBeenCalledWith(expect.anything(), {});
  });

  it('debounces repeated changes and indexes only the latest file snapshot', async () => {
    const { rerender } = renderHook(() => useRagIndexer());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    ragSearch.indexWorkspaceFiles.mockClear();

    mockEditorState.mockReturnValue({ fileContents: { 'a.js': 'first' } } as never);
    rerender();
    mockEditorState.mockReturnValue({ fileContents: { 'a.js': 'second' } } as never);
    rerender();
    await act(async () => {
      vi.advanceTimersByTime(1600);
      await Promise.resolve();
    });

    expect(ragSearch.indexWorkspaceFiles).toHaveBeenCalledTimes(1);
    expect(ragSearch.indexWorkspaceFiles).toHaveBeenCalledWith({ 'a.js': 'second' });
  });

  it('reports failures while synchronizing changed editor contents', async () => {
    const { rerender } = renderHook(() => useRagIndexer());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    ragSearch.indexWorkspaceFiles.mockRejectedValueOnce(new Error('sync failed'));

    mockEditorState.mockReturnValue({ fileContents: { 'a.js': 'changed' } } as never);
    rerender();
    await act(async () => {
      vi.advanceTimersByTime(1600);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[RAG] Failed to sync workspace index:',
      expect.objectContaining({ message: 'sync failed' }),
    );
  });

  it('uses an empty snapshot when editor contents are cleared', async () => {
    mockEditorState.mockReturnValue({ fileContents: { 'a.js': 'initial' } } as never);
    const { rerender } = renderHook(() => useRagIndexer());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    ragSearch.indexWorkspaceFiles.mockClear();

    mockEditorState.mockReturnValue({ fileContents: undefined } as never);
    rerender();
    await act(async () => {
      vi.advanceTimersByTime(1600);
      await Promise.resolve();
    });

    expect(ragSearch.indexWorkspaceFiles).toHaveBeenCalledWith({});
  });

  it('reports non-Error initialization failures', async () => {
    ragSearch.init.mockRejectedValue('initialization failed');

    renderHook(() => useRagIndexer());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[RAG] Failed to initialize indexer:',
      'initialization failed',
    );
  });

  it('handles empty and missing file content when fingerprinting', () => {
    expect(fingerprintContents()).toBe('');
    expect(fingerprintContents({ 'a.js': undefined } as never)).toMatch(/^a\.js:0:/);
  });

  it('generates different fingerprints for changed content with identical byte count', () => {
    const fp1 = fingerprintContents({ 'a.js': 'var x = 1' });
    const fp2 = fingerprintContents({ 'a.js': 'let y = 2' });
    expect(fp1).not.toEqual(fp2);
  });
});
