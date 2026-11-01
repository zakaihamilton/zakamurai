import {
  createMockPreviewWindow,
  mockCompilerContainer,
  mockExternalPreviewRef,
  mockIframeRef,
  stubMessageChannel,
} from '@/test-utils/previewMocks';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PreviewBridge, { MAX_SESSION_CAPABILITIES, getSessionCapability } from './PreviewBridge';
import { PREVIEW_CONNECT, PREVIEW_CONNECT_ACK, PREVIEW_PROTOCOL_VERSION } from './previewProtocol';

const CAPABILITY_PATTERN = /^[a-f\d]{64}$/i;

describe('PreviewBridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts handshake from the active external preview window', () => {
    const externalWindow = createMockPreviewWindow();
    const iframeWindow = createMockPreviewWindow();
    const iframeRef = mockIframeRef(iframeWindow);
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
      expect.objectContaining({
        type: PREVIEW_CONNECT,
        version: PREVIEW_PROTOCOL_VERSION,
        sessionId: 'test-session-123',
        workerCapability: expect.stringMatching(CAPABILITY_PATTERN),
      }),
      'http://localhost:3001',
      expect.any(Array),
    );
  });

  it('keeps the ephemeral capability stable when the preview surface remounts', () => {
    const firstWindow = createMockPreviewWindow();
    const firstRender = render(
      <PreviewBridge
        iframeRef={mockIframeRef(null)}
        externalPreviewRef={mockExternalPreviewRef(firstWindow)}
        externalPreviewNonce={1}
        sessionId="stable-session"
        previewOrigin="http://localhost:3001"
        onError={vi.fn()}
      />,
    );
    const firstMessage = firstWindow.postMessage.mock.calls[0]?.[0] as {
      workerCapability?: string;
    };
    firstRender.unmount();

    const secondWindow = createMockPreviewWindow();
    const secondRender = render(
      <PreviewBridge
        iframeRef={mockIframeRef(null)}
        externalPreviewRef={mockExternalPreviewRef(secondWindow)}
        externalPreviewNonce={1}
        sessionId="stable-session"
        previewOrigin="http://localhost:3001"
        onError={vi.fn()}
      />,
    );
    const secondMessage = secondWindow.postMessage.mock.calls[0]?.[0] as {
      workerCapability?: string;
    };

    expect(secondMessage.workerCapability).toBe(firstMessage.workerCapability);
    secondRender.unmount();
  });

  it('restores the same capability after switching away from and back to a preview session', () => {
    const renderSession = (sessionId: string) => {
      const target = createMockPreviewWindow();
      const result = render(
        <PreviewBridge
          iframeRef={mockIframeRef(null)}
          externalPreviewRef={mockExternalPreviewRef(target)}
          externalPreviewNonce={1}
          sessionId={sessionId}
          previewOrigin="http://localhost:3001"
          onError={vi.fn()}
        />,
      );
      const message = target.postMessage.mock.calls[0]?.[0] as {
        workerCapability?: string;
      };
      result.unmount();
      return message.workerCapability;
    };

    const firstCapability = renderSession('returning-session');
    renderSession('intermediate-session');
    const returnedCapability = renderSession('returning-session');

    expect(returnedCapability).toBe(firstCapability);
  });

  it('ignores replayed connect messages after a surface is confirmed', () => {
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

    const dispatchConnect = () => {
      const event = new MessageEvent('message', {
        data: {
          type: PREVIEW_CONNECT,
          version: PREVIEW_PROTOCOL_VERSION,
          sessionId: 'test-session-123',
        },
        origin: 'http://localhost:3001',
      });
      Object.defineProperty(event, 'source', { value: externalWindow });
      act(() => window.dispatchEvent(event));
    };

    dispatchConnect();
    const firstCallCount = externalWindow.postMessage.mock.calls.length;
    dispatchConnect();
    expect(externalWindow.postMessage).toHaveBeenCalledTimes(firstCallCount);
  });

  it('rejects a matching handshake from an unknown same-origin window', () => {
    const activeWindow = createMockPreviewWindow();
    const unknownWindow = createMockPreviewWindow();

    render(
      <PreviewBridge
        iframeRef={mockIframeRef(null)}
        externalPreviewRef={mockExternalPreviewRef(activeWindow)}
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
    Object.defineProperty(connectEvent, 'source', { value: unknownWindow });

    act(() => {
      window.dispatchEvent(connectEvent);
    });

    expect(activeWindow.postMessage).not.toHaveBeenCalled();
    expect(unknownWindow.postMessage).not.toHaveBeenCalled();
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
    const sentHandshake = externalWindow.postMessage.mock.calls[0]?.[0] as {
      workerCapability?: string;
    };
    act(() => {
      const ackEvent = new MessageEvent('message', {
        data: {
          type: PREVIEW_CONNECT_ACK,
          version: PREVIEW_PROTOCOL_VERSION,
          sessionId: 'test-session-123',
          workerCapability: sentHandshake.workerCapability,
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

  it('continues retrying after an acknowledgement from an unknown same-origin window', () => {
    vi.useFakeTimers();
    const activeWindow = createMockPreviewWindow();
    const unknownWindow = createMockPreviewWindow();

    render(
      <PreviewBridge
        iframeRef={mockIframeRef(null)}
        externalPreviewRef={mockExternalPreviewRef(activeWindow)}
        externalPreviewNonce={1}
        sessionId="test-session-123"
        previewOrigin="http://localhost:3001"
        onError={vi.fn()}
      />,
    );

    const initialCalls = activeWindow.postMessage.mock.calls.length;
    const ackEvent = new MessageEvent('message', {
      data: {
        type: PREVIEW_CONNECT_ACK,
        version: PREVIEW_PROTOCOL_VERSION,
        sessionId: 'test-session-123',
        workerCapability: 'a'.repeat(64),
        surface: 'external',
      },
      origin: 'http://localhost:3001',
    });
    Object.defineProperty(ackEvent, 'source', { value: unknownWindow });

    act(() => {
      window.dispatchEvent(ackEvent);
      vi.advanceTimersByTime(400);
    });

    expect(activeWindow.postMessage.mock.calls.length).toBeGreaterThan(initialCalls);
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

  it('bounds sessionCapabilities with LRU eviction when exceeding MAX_SESSION_CAPABILITIES', () => {
    const firstCap = getSessionCapability('lru-session-0');
    const secondCap = getSessionCapability('lru-session-1');

    for (let i = 2; i < MAX_SESSION_CAPABILITIES; i++) {
      getSessionCapability(`lru-session-${i}`);
    }

    // Touch lru-session-0 so it becomes most-recently-used; lru-session-1 is now oldest.
    expect(getSessionCapability('lru-session-0')).toBe(firstCap);

    // Adding one more entry should evict lru-session-1 while preserving lru-session-0.
    getSessionCapability('lru-session-overflow');
    expect(getSessionCapability('lru-session-0')).toBe(firstCap);
    expect(getSessionCapability('lru-session-1')).not.toBe(secondCap);
  });
});
