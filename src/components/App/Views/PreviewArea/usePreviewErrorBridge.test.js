import { PreviewState } from '@/components/App/PreviewState';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { reportPreviewError } from './previewErrorBridge';
import { usePreviewErrorBridge } from './usePreviewErrorBridge';

vi.mock('@/components/App/PreviewState', () => ({
  PreviewState: { usePassiveState: vi.fn() },
}));

describe('usePreviewErrorBridge', () => {
  it('registers error listener and updates previewState on error', () => {
    const previewState = vi.fn();
    PreviewState.usePassiveState.mockReturnValue(previewState);

    const { unmount } = renderHook(() => usePreviewErrorBridge());

    // Trigger error reporting which should trigger listener registered by hook
    reportPreviewError('Test Error Message');

    expect(previewState).toHaveBeenCalled();

    unmount();
  });
});
