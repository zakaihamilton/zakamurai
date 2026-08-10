import { AppState } from '@/components/App/AppState';
import { PreviewState } from '@/components/App/PreviewState';
import { makeAppState, makePreviewState } from '@/test-utils/stateMocks';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreviewRestorer } from './PreviewRestorer';

vi.mock('@/components/App/PreviewState', () => ({
  PreviewState: { useState: vi.fn() },
}));

vi.mock('@/components/App/AppState', () => ({
  AppState: { useState: vi.fn() },
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

    appStateMock = makeAppState({
      silentCompileRequest: 0,
    });

    vi.mocked(PreviewState.useState).mockReturnValue(previewStateMock);
    vi.mocked(AppState.useState).mockReturnValue(appStateMock);
  });

  it('triggers a silent compile when restoring a saved preview without setting a restore error', async () => {
    renderHook(() => usePreviewRestorer());

    await act(async () => {
      await Promise.resolve();
    });

    expect(previewStateMock.isCompilerReady).toBe(false);
    expect(previewStateMock.restoreError).toBeNull();
    expect(appStateMock.silentCompileRequest).toBe(1);
  });

  it('handles an empty preview without triggering a compile or setting an error', async () => {
    previewStateMock.htmlContent = null;

    renderHook(() => usePreviewRestorer());

    await act(async () => {
      await Promise.resolve();
    });

    expect(previewStateMock.restoreError).toBeNull();
    expect(previewStateMock.isCompilerReady).toBe(false);
    expect(appStateMock.silentCompileRequest).toBe(0);
  });
});
