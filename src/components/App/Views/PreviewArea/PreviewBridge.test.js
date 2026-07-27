import { act, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PreviewBridge from './PreviewBridge';
import { PREVIEW_CONNECT, PREVIEW_PROTOCOL_VERSION } from './previewProtocol';

describe('PreviewBridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts handshake from an external preview window when event.source identity differs cross-origin', () => {
    const externalWindow = { postMessage: vi.fn() };
    const iframeWindow = { postMessage: vi.fn() };
    const iframeRef = { current: { contentWindow: iframeWindow } };
    const externalPreviewRef = { current: { ...externalWindow } }; // non-identical object reference

    render(
      <PreviewBridge
        iframeRef={iframeRef}
        externalPreviewRef={externalPreviewRef}
        sessionId="test-session-123"
        previewOrigin="http://localhost:3001"
        onError={vi.fn()}
      />,
    );

    const connectEvent = new MessageEvent('message', {
      data: {
        type: PREVIEW_CONNECT,
        version: PREVIEW_PROTOCOL_VERSION,
        sessionId: 'test-session-123',
      },
      origin: 'http://localhost:3001',
    });
    Object.defineProperty(connectEvent, 'source', { value: externalWindow });

    act(() => {
      window.dispatchEvent(connectEvent);
    });

    expect(externalWindow.postMessage).toHaveBeenCalledWith(
      {
        type: PREVIEW_CONNECT,
        version: PREVIEW_PROTOCOL_VERSION,
        sessionId: 'test-session-123',
      },
      'http://localhost:3001',
      expect.any(Array),
    );
  });

  it('rejects handshake with invalid origin or mismatched session ID', () => {
    const externalWindow = { postMessage: vi.fn() };
    const iframeRef = { current: { contentWindow: null } };
    const externalPreviewRef = { current: externalWindow };

    render(
      <PreviewBridge
        iframeRef={iframeRef}
        externalPreviewRef={externalPreviewRef}
        sessionId="test-session-123"
        previewOrigin="http://localhost:3001"
        onError={vi.fn()}
      />,
    );

    const invalidOriginEvent = new MessageEvent('message', {
      data: {
        type: PREVIEW_CONNECT,
        version: PREVIEW_PROTOCOL_VERSION,
        sessionId: 'test-session-123',
      },
      origin: 'http://attacker.com',
    });
    Object.defineProperty(invalidOriginEvent, 'source', { value: externalWindow });

    act(() => {
      window.dispatchEvent(invalidOriginEvent);
    });

    expect(externalWindow.postMessage).not.toHaveBeenCalled();
  });
});
