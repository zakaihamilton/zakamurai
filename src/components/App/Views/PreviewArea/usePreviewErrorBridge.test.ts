import { PreviewState } from '@/components/App/PreviewState';
import { makePreviewState } from '@/test-utils/stateMocks';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { reportPreviewError } from './previewErrorBridge';
import { usePreviewErrorBridge } from './usePreviewErrorBridge';

vi.mock('@/components/App/PreviewState', () => ({
  PreviewState: { usePassiveState: vi.fn() },
}));

describe('usePreviewErrorBridge', () => {
  it('registers error listener and updates previewState on error', () => {
    const previewState = makePreviewState();
    vi.mocked(PreviewState.usePassiveState).mockReturnValue(previewState);

    const { unmount } = renderHook(() => usePreviewErrorBridge());

    reportPreviewError('Test Error Message');

    expect(previewState).toHaveBeenCalled();

    unmount();
  });
});
