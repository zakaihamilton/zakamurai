import { ragSearch } from '@/utils/rag/search-utility';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppState } from '../App/AppState';
import { EditorState } from '../App/Views/EditorArea';
import { useRagIndexer } from './RagIndexer';

vi.mock('@/utils/rag/search-utility', () => {
  return {
    ragSearch: {
      init: vi.fn(),
    },
  };
});

vi.mock('../App/AppState', () => ({
  AppState: { useState: vi.fn() },
}));

vi.mock('../App/Views/EditorArea', () => ({
  EditorState: { useState: vi.fn() },
}));

describe('useRagIndexer', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    AppState.useState.mockReturnValue({ fs: { isReady: true } });
    EditorState.useState.mockReturnValue({ fileContents: {} });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith('[RAG] Failed to initialize indexer:', error);
  });

  it('rejects on timeout if RAG init hangs', async () => {
    // Return a promise that never resolves
    ragSearch.init.mockReturnValue(new Promise(() => {}));

    renderHook(() => useRagIndexer());

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
