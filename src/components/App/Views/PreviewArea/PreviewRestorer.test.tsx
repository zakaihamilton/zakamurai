import { PreviewState } from '@/components/App/PreviewState';
import { makePreviewState } from '@/test-utils/stateMocks';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreviewRestorer } from './PreviewRestorer';

vi.mock('@/components/App/PreviewState', () => ({
  PreviewState: { useState: vi.fn() },
}));

describe('usePreviewRestorer', () => {
  let previewStateMock: ReturnType<typeof makePreviewState>;

  beforeEach(() => {
    vi.clearAllMocks();

    previewStateMock = makePreviewState({
      htmlContent: '<html></html>',
      isCompilerReady: false,
      restoreError: null,
      previewAddress: '/preview/dist/index.html',
    });

    vi.mocked(PreviewState.useState).mockReturnValue(previewStateMock);
  });

  it('does not compile when restoring a saved preview', async () => {
    renderHook(() => usePreviewRestorer());

    await act(async () => {
      await Promise.resolve();
    });

    expect(previewStateMock.isCompilerReady).toBe(true);
    expect(previewStateMock.restoreError).toBe(
      'Preview needs to be rebuilt after reloading. Build the project to start it.',
    );
  });

  it('marks an empty preview as ready without an error', async () => {
    previewStateMock.htmlContent = null;

    renderHook(() => usePreviewRestorer());

    await act(async () => {
      await Promise.resolve();
    });

    expect(previewStateMock.restoreError).toBeNull();
    expect(previewStateMock.isCompilerReady).toBe(true);
  });
});
