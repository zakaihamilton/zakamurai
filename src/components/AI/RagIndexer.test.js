import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRagIndexer } from './RagIndexer';

const ragSearch = {
  init: vi.fn(),
  indexWorkspaceFiles: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/utils/rag/search-utility', () => {
  return {
    ragSearch: {
      init: (...args) => ragSearch.init(...args),
      indexWorkspaceFiles: (...args) => ragSearch.indexWorkspaceFiles(...args),
    },
  };
});

const collectWorkspaceFiles = vi.fn().mockResolvedValue({});

vi.mock('@/components/AI/Agent/Snapshot', () => ({
  collectWorkspaceFiles: (...args) => collectWorkspaceFiles(...args),
}));

vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: {
    useState: vi.fn(),
  },
}));

import { AppState } from '@/components/App/AppState';
import { EditorState } from '@/components/App/Views/EditorArea';

describe('useRagIndexer', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    AppState.useState.mockReturnValue({ fs: { isReady: true } });
    EditorState.useState.mockReturnValue({ fileContents: {} });
    collectWorkspaceFiles.mockResolvedValue({});
    ragSearch.indexWorkspaceFiles.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('initializes RAG successfully', async () => {
    let resolveInit;
    const initPromise = new Promise((resolve) => {
      resolveInit = resolve;
    });
    ragSearch.init.mockReturnValue(initPromise);

    renderHook(() => useRagIndexer());

    await act(async () => {
      await Promise.resolve();
    });

    expect(ragSearch.init).toHaveBeenCalled();

    await act(async () => {
      resolveInit();
      await initPromise;
    });

    expect(consoleLogSpy).toHaveBeenCalledWith('[RAG] Indexer initialized successfully.');
  });

  it('logs error if RAG initialization fails', async () => {
    const error = new Error('Init error');
    ragSearch.init.mockRejectedValue(error);

    renderHook(() => useRagIndexer());

    // Flush macro tasks / micro tasks so the promise rejection is handled
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith('[RAG] Failed to initialize indexer:', error);
  });

  it('rejects on timeout if RAG init hangs', async () => {
    // Return a promise that never resolves
    ragSearch.init.mockReturnValue(new Promise(() => {}));

    renderHook(() => useRagIndexer());

    // Wait for dynamic imports to finish and start init (registers the 10s timeout).
    await act(async () => {
      for (let i = 0; i < 20 && !ragSearch.init.mock.calls.length; i++) {
        await Promise.resolve();
      }
    });
    expect(ragSearch.init).toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[RAG] Failed to initialize indexer:',
      expect.any(Error),
    );
  });
});
