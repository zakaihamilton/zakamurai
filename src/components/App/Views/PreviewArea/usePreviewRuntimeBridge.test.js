import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PREVIEW_MESSAGE_TYPES } from './previewSandbox';
import usePreviewRuntimeBridge from './usePreviewRuntimeBridge';

describe('usePreviewRuntimeBridge', () => {
  it('accepts runtime errors only from the active preview iframe', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const iframeRef = { current: iframe };
    const previewAreaUiState = vi.fn((updater) => updater({ address: '/preview/' }));
    const setPreviewError = vi.fn();
    const { unmount } = renderHook(() =>
      usePreviewRuntimeBridge({
        iframeRef,
        previewAreaUiState,
        previewUrl: 'http://localhost:3001/?session=test',
        previewOrigin: 'http://localhost:3001',
        setPreviewError,
        setHasLoadedOnce: vi.fn(),
      }),
    );
    const event = new MessageEvent('message', {
      data: {
        source: 'zakamurai-preview',
        type: PREVIEW_MESSAGE_TYPES.RUNTIME_ERROR,
        message: 'ReferenceError: app is not defined',
      },
      origin: 'http://localhost:3001',
    });
    Object.defineProperty(event, 'source', { value: iframe.contentWindow });

    act(() => {
      window.dispatchEvent(event);
    });
    expect(setPreviewError).toHaveBeenCalledWith('ReferenceError: app is not defined');

    unmount();
    iframe.remove();
  });
});
