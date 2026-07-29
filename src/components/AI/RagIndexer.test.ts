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

describe('useRagIndexer', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    useFileSystem.mockReturnValue({ isReady: true });
    EditorState.useState.mockReturnValue({ fileContents: {} });
    RagState.useState.mockReturnValue(Object.assign(vi.fn(), { status: 'idle' }));
    ragSearch.init.mockResolvedValue(undefined);
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
    EditorState.useState.mockReturnValue({ fileContents: { 'a.js': 'hi' } });
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

  it('generates different fingerprints for changed content with identical byte count', async () => {
    const { fingerprintContents } = await import('./RagIndexer');
    const fp1 = fingerprintContents({ 'a.js': 'var x = 1' });
    const fp2 = fingerprintContents({ 'a.js': 'let y = 2' });
    expect(fp1).not.toEqual(fp2);
  });
});
