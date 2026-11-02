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

  it('leaves a saved preview for manual rebuild after reload', async () => {
    renderHook(() => usePreviewRestorer());

    await act(async () => {
      await Promise.resolve();
    });

    expect(previewStateMock.isCompilerReady).toBe(false);
    expect(previewStateMock.restoreError).toBe(
      'The saved preview needs a new build after reload. Select Build to restore it.',
    );
  });

  it('handles an empty preview without setting an error', async () => {
    previewStateMock.htmlContent = null;

    renderHook(() => usePreviewRestorer());

    await act(async () => {
      await Promise.resolve();
    });

    expect(previewStateMock.restoreError).toBeNull();
    expect(previewStateMock.isCompilerReady).toBe(false);
  });
});
