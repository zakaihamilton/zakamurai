import { act, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMockPreviewWindow,
  mockCompilerContainer,
  mockExternalPreviewRef,
  mockIframeRef,
  stubMessageChannel,
} from '@/test-utils/previewMocks';
import PreviewBridge from './PreviewBridge';
import { PREVIEW_CONNECT, PREVIEW_CONNECT_ACK, PREVIEW_PROTOCOL_VERSION } from './previewProtocol';

describe('PreviewBridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts handshake from an external preview window when event.source identity differs cross-origin', () => {
    const externalWindow = createMockPreviewWindow();
    const iframeWindow = createMockPreviewWindow();
    const iframeRef = mockIframeRef(iframeWindow);
    const externalPreviewRef = mockExternalPreviewRef({ ...externalWindow });

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
    const externalWindow = createMockPreviewWindow();
    const iframeRef = mockIframeRef(null);
    const externalPreviewRef = mockExternalPreviewRef(externalWindow);

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
    const iframeWindow = createMockPreviewWindow();
    const iframeRef = mockIframeRef(iframeWindow);
    const externalPreviewRef = mockExternalPreviewRef(null);

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
    const externalWindow = createMockPreviewWindow();
    const externalPreviewRef = mockExternalPreviewRef(externalWindow);
    const iframeRef = mockIframeRef(null);

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

    const { getBridgePort } = stubMessageChannel();

    const { Compiler } = await import('@/utils/compiler');
    vi.spyOn(Compiler, 'getContainer').mockReturnValue(mockCompilerContainer({ handleRequest }));

    const externalWindow = createMockPreviewWindow();
    const externalPreviewRef = mockExternalPreviewRef(externalWindow);
    const iframeRef = mockIframeRef(null);

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

    const bridgePort = getBridgePort();

    await act(async () => {
      await bridgePort.onmessage?.({
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
    const externalWindow = createMockPreviewWindow();
    const externalPreviewRef = mockExternalPreviewRef(externalWindow);
    const iframeRef = mockIframeRef(null);

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

  it('retries external handshake until the preview host acknowledges', () => {
    vi.useFakeTimers();
    const externalWindow = createMockPreviewWindow();
    const externalPreviewRef = mockExternalPreviewRef(externalWindow);
    const iframeRef = mockIframeRef(null);

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

    expect(externalWindow.postMessage).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(externalWindow.postMessage).toHaveBeenCalledTimes(2);

    const callsAfterRetry = externalWindow.postMessage.mock.calls.length;
    act(() => {
      const ackEvent = new MessageEvent('message', {
        data: {
          type: PREVIEW_CONNECT_ACK,
          version: PREVIEW_PROTOCOL_VERSION,
          sessionId: 'test-session-123',
          surface: 'external',
        },
        origin: 'http://localhost:3001',
      });
      Object.defineProperty(ackEvent, 'source', { value: externalWindow });
      window.dispatchEvent(ackEvent);
    });

    const callsAfterAck = externalWindow.postMessage.mock.calls.length;
    expect(callsAfterAck).toBe(callsAfterRetry);
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(externalWindow.postMessage).toHaveBeenCalledTimes(callsAfterAck);

    vi.useRealTimers();
  });

  it('pushes handshake to the preview iframe when iframeHandshakeNonce changes', () => {
    const iframeWindow = createMockPreviewWindow();
    const iframeRef = mockIframeRef(iframeWindow);
    const externalPreviewRef = mockExternalPreviewRef(null);

    render(
      <PreviewBridge
        iframeRef={iframeRef}
        externalPreviewRef={externalPreviewRef}
        iframeHandshakeNonce={1}
        sessionId="test-session-123"
        previewOrigin="http://localhost:3001"
        onError={vi.fn()}
      />,
    );

    expect(iframeWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: PREVIEW_CONNECT, sessionId: 'test-session-123' }),
      'http://localhost:3001',
      expect.any(Array),
    );
  });

  it('streams large preview responses in chunks', async () => {
    const largeBody = new Uint8Array(70 * 1024).fill(65);
    const handleRequest = vi.fn().mockResolvedValue({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: largeBody,
    });

    const { getBridgePort } = stubMessageChannel();

    const { Compiler } = await import('@/utils/compiler');
    vi.spyOn(Compiler, 'getContainer').mockReturnValue(mockCompilerContainer({ handleRequest }));

    const externalWindow = createMockPreviewWindow();
    render(
      <PreviewBridge
        iframeRef={mockIframeRef(null)}
        externalPreviewRef={mockExternalPreviewRef(externalWindow)}
        sessionId="test-session-123"
        previewOrigin="http://localhost:3001"
        onError={vi.fn()}
      />,
    );

    act(() => {
      const connectEvent = new MessageEvent('message', {
        data: {
          type: PREVIEW_CONNECT,
          version: PREVIEW_PROTOCOL_VERSION,
          sessionId: 'test-session-123',
        },
        origin: 'http://localhost:3001',
      });
      Object.defineProperty(connectEvent, 'source', { value: externalWindow });
      window.dispatchEvent(connectEvent);
    });

    const bridgePort = getBridgePort();

    await act(async () => {
      await bridgePort.onmessage?.({
        data: {
          type: 'preview-request',
          id: 2,
          sessionId: 'test-session-123',
          method: 'GET',
          path: '/big.bin',
          headers: {},
          streaming: true,
        },
      });
    });

    expect(bridgePort.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'preview-stream-start', id: 2 }),
    );
    expect(bridgePort.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'preview-stream-end', id: 2 }),
    );

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports preview request failures through onError', async () => {
    const onError = vi.fn();
    const { getBridgePort } = stubMessageChannel();

    const { Compiler } = await import('@/utils/compiler');
    vi.spyOn(Compiler, 'getContainer').mockReturnValue(mockCompilerContainer(null));

    const externalWindow = createMockPreviewWindow();
    render(
      <PreviewBridge
        iframeRef={mockIframeRef(null)}
        externalPreviewRef={mockExternalPreviewRef(externalWindow)}
        sessionId="test-session-123"
        previewOrigin="http://localhost:3001"
        onError={onError}
      />,
    );

    act(() => {
      const connectEvent = new MessageEvent('message', {
        data: {
          type: PREVIEW_CONNECT,
          version: PREVIEW_PROTOCOL_VERSION,
          sessionId: 'test-session-123',
        },
        origin: 'http://localhost:3001',
      });
      Object.defineProperty(connectEvent, 'source', { value: externalWindow });
      window.dispatchEvent(connectEvent);
    });

    const bridgePort = getBridgePort();

    await act(async () => {
      await bridgePort.onmessage?.({
        data: {
          type: 'preview-request',
          id: 3,
          sessionId: 'test-session-123',
          method: 'GET',
          path: '/fail',
          headers: {},
        },
      });
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('not ready'));
    expect(bridgePort.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'preview-response', error: expect.any(String) }),
    );

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
