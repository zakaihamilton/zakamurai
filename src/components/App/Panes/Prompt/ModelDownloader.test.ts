import { makePromptUiState } from '@/test-utils/stateMocks';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useModelDownloader from './ModelDownloader';

vi.mock('@/components/AI/WebLLMAPI', () => ({
  getCachedWebLLMModelIds: vi.fn().mockResolvedValue(['Qwen3.5-4B-q4f16_1-MLC']),
  cacheWebLLMModel: vi.fn().mockResolvedValue(undefined),
  deleteCachedWebLLMModel: vi.fn().mockResolvedValue(undefined),
}));

describe('useModelDownloader', () => {
  it('returns all Model Downloader hooks', () => {
    const mockPromptUiState = makePromptUiState();
    const { result } = renderHook(() => useModelDownloader(mockPromptUiState));

    expect(result.current.loadCachedModelIds).toBeTypeOf('function');
    expect(result.current.openModelManager).toBeTypeOf('function');
    expect(result.current.closeModelManager).toBeTypeOf('function');
    expect(result.current.handleModelCacheAction).toBeTypeOf('function');
  });

  it('triggers model cache metadata requests on opening manager', () => {
    const mockPromptUiState = makePromptUiState();
    const { result } = renderHook(() => useModelDownloader(mockPromptUiState));

    act(() => {
      result.current.openModelManager();
    });

    expect(mockPromptUiState).toHaveBeenCalled();
  });
});
