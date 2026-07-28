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

  it('accepts handshake from iframe window', () => {
    const iframeWindow = { postMessage: vi.fn() };
    const iframeRef = { current: { contentWindow: iframeWindow } };
    const externalPreviewRef = { current: null };

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
    Object.defineProperty(connectEvent, 'source', { value: iframeWindow });

    act(() => {
      window.dispatchEvent(connectEvent);
    });

    expect(iframeWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: PREVIEW_CONNECT, sessionId: 'test-session-123' }),
      'http://localhost:3001',
      expect.any(Array),
    );
  });

  it('rejects handshake with mismatched session ID', () => {
    const externalWindow = { postMessage: vi.fn() };
    const externalPreviewRef = { current: externalWindow };
    const iframeRef = { current: { contentWindow: null } };

    render(
      <PreviewBridge
        iframeRef={iframeRef}
        externalPreviewRef={externalPreviewRef}
        sessionId="test-session-123"
        previewOrigin="http://localhost:3001"
        onError={vi.fn()}
      />,
    );

    const wrongSessionEvent = new MessageEvent('message', {
      data: {
        type: PREVIEW_CONNECT,
        version: PREVIEW_PROTOCOL_VERSION,
        sessionId: 'other-session',
      },
      origin: 'http://localhost:3001',
    });
    Object.defineProperty(wrongSessionEvent, 'source', { value: externalWindow });

    act(() => {
      window.dispatchEvent(wrongSessionEvent);
    });

    expect(externalWindow.postMessage).not.toHaveBeenCalled();
  });

  it('forwards preview requests through Compiler serverBridge', async () => {
    const handleRequest = vi.fn().mockResolvedValue({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'Content-Type': 'text/html' },
      body: new Uint8Array([72, 105]),
    });

    let bridgePort;
    vi.stubGlobal(
      'MessageChannel',
      class {
        constructor() {
          this.port1 = {
            postMessage: vi.fn(),
            onmessage: null,
            close: vi.fn(),
          };
          this.port2 = { postMessage: vi.fn(), close: vi.fn() };
          bridgePort = this.port1;
        }
      },
    );

    const { Compiler } = await import('@/utils/compiler');
    vi.spyOn(Compiler, 'getContainer').mockReturnValue({
      serverBridge: { handleRequest },
    });

    const externalWindow = { postMessage: vi.fn() };
    const externalPreviewRef = { current: externalWindow };
    const iframeRef = { current: { contentWindow: null } };

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

    expect(bridgePort).toBeDefined();

    await act(async () => {
      await bridgePort.onmessage({
        data: {
          type: 'preview-request',
          id: 1,
          sessionId: 'test-session-123',
          method: 'GET',
          path: '/index.html',
          headers: {},
        },
      });
    });

    expect(handleRequest).toHaveBeenCalled();
    expect(bridgePort.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'preview-response', statusCode: 200 }),
    );

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('pushes handshake to an external preview tab when externalPreviewNonce changes', () => {
    const externalWindow = { postMessage: vi.fn() };
    const externalPreviewRef = { current: externalWindow };
    const iframeRef = { current: { contentWindow: null } };

    render(
      <PreviewBridge
        iframeRef={iframeRef}
        externalPreviewRef={externalPreviewRef}
        externalPreviewNonce={1}
        sessionId="test-session-123"
        previewOrigin="http://localhost:3001"
        onError={vi.fn()}
      />,
    );

    expect(externalWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: PREVIEW_CONNECT, sessionId: 'test-session-123' }),
      'http://localhost:3001',
      expect.any(Array),
    );
  });
});
