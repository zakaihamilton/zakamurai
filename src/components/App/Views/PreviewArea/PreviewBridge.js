import { Compiler } from '@/utils/compiler';
import { useEffect, useRef } from 'react';
import { isValidPreviewHandshake, originMatches } from './previewOrigins';
import {
  PREVIEW_CONNECT,
  PREVIEW_PROTOCOL_VERSION,
  PREVIEW_RESPONSE,
  PREVIEW_STREAM_CHUNK,
  PREVIEW_STREAM_END,
  PREVIEW_STREAM_START,
  isPreviewRequest,
  toBase64,
} from './previewProtocol';

const STREAM_CHUNK_SIZE = 64 * 1024;
const EXTERNAL_HANDSHAKE_INTERVAL_MS = 400;
const EXTERNAL_HANDSHAKE_TIMEOUT_MS = 12000;

function toResponsePayload(response) {
  const body =
    response?.body instanceof Uint8Array ? response.body : new Uint8Array(response?.body || []);
  return {
    statusCode: response?.statusCode || 500,
    statusMessage: response?.statusMessage || 'Internal Server Error',
    headers: response?.headers || { 'Content-Type': 'text/plain' },
    body,
  };
}

async function handleRequest(message) {
  const container = Compiler.getContainer();
  if (!container?.serverBridge)
    throw new Error('Preview server is not ready. Build the project again.');
  const body = message.bodyBase64
    ? Uint8Array.from(atob(message.bodyBase64), (char) => char.charCodeAt(0))
    : null;
  return toResponsePayload(
    await container.serverBridge.handleRequest(
      3000,
      message.method,
      message.path,
      message.headers || {},
      body,
    ),
  );
}

function attachBridgePort({ portsRef, source, port, sessionId, onError }) {
  const closePort = (target) => {
    const existing = portsRef.current.get(target);
    existing?.close();
    portsRef.current.delete(target);
  };

  closePort(source);
  portsRef.current.set(source, port);
  port.onmessage = async ({ data: request }) => {
    if (!isPreviewRequest(request, sessionId)) return;
    try {
      const response = await handleRequest(request);
      if (request.streaming) {
        port.postMessage({
          type: PREVIEW_STREAM_START,
          id: request.id,
          sessionId,
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          headers: response.headers,
        });
        for (let offset = 0; offset < response.body.length; offset += STREAM_CHUNK_SIZE) {
          port.postMessage({
            type: PREVIEW_STREAM_CHUNK,
            id: request.id,
            sessionId,
            chunkBase64: toBase64(response.body.subarray(offset, offset + STREAM_CHUNK_SIZE)),
          });
        }
        port.postMessage({ type: PREVIEW_STREAM_END, id: request.id, sessionId });
        return;
      }
      port.postMessage({
        type: PREVIEW_RESPONSE,
        id: request.id,
        sessionId,
        statusCode: response.statusCode,
        statusMessage: response.statusMessage,
        headers: response.headers,
        bodyBase64: toBase64(response.body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      port.postMessage({
        type: PREVIEW_RESPONSE,
        id: request.id,
        sessionId,
        error: message,
      });
      onError?.(message);
    }
  };
}

function pushHandshake(target, { portsRef, sessionId, previewOrigin, onError }) {
  if (!target || portsRef.current.has(target)) return;
  const channel = new MessageChannel();
  attachBridgePort({
    portsRef,
    source: target,
    port: channel.port1,
    sessionId,
    onError,
  });
  try {
    target.postMessage(
      { type: PREVIEW_CONNECT, version: PREVIEW_PROTOCOL_VERSION, sessionId },
      previewOrigin,
      [channel.port2],
    );
  } catch {
    // Preview surface may not be ready yet.
  }
}

/** Bridges an isolated preview service worker to the local almostnode server. */
export default function PreviewBridge({
  iframeRef,
  externalPreviewRef,
  externalPreviewNonce = 0,
  iframeHandshakeNonce = 0,
  sessionId,
  previewOrigin,
  onError,
}) {
  const portsRef = useRef(new Map());

  useEffect(() => {
    const onMessage = (event) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      const externalPreviewWindow = externalPreviewRef?.current;
      const isIframeSource = Boolean(iframeWindow && event.source === iframeWindow);
      const isExternalSource = Boolean(
        externalPreviewWindow && event.source === externalPreviewWindow,
      );
      const expectedSource = isExternalSource
        ? externalPreviewWindow
        : isIframeSource
          ? iframeWindow
          : null;

      const handshakeOk =
        isValidPreviewHandshake(event, {
          expectedOrigin: previewOrigin,
          expectedSource,
          sessionId,
          type: PREVIEW_CONNECT,
          version: PREVIEW_PROTOCOL_VERSION,
        }) ||
        (originMatches(event.origin, previewOrigin) &&
          event.data?.type === PREVIEW_CONNECT &&
          event.data?.version === PREVIEW_PROTOCOL_VERSION &&
          event.data?.sessionId === sessionId);

      if (!handshakeOk) return;
      const channel = new MessageChannel();
      attachBridgePort({
        portsRef,
        source: event.source,
        port: channel.port1,
        sessionId,
        onError,
      });
      event.source?.postMessage(
        { type: PREVIEW_CONNECT, version: PREVIEW_PROTOCOL_VERSION, sessionId },
        previewOrigin,
        [channel.port2],
      );
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      for (const port of portsRef.current.values()) port.close();
      portsRef.current.clear();
    };
  }, [externalPreviewRef, iframeRef, onError, previewOrigin, sessionId]);

  useEffect(() => {
    const externalWindow = externalPreviewRef?.current;
    if (!externalWindow || !externalPreviewNonce) return undefined;

    const push = () =>
      pushHandshake(externalWindow, { portsRef, sessionId, previewOrigin, onError });
    push();
    const interval = window.setInterval(push, EXTERNAL_HANDSHAKE_INTERVAL_MS);
    const timeout = window.setTimeout(
      () => window.clearInterval(interval),
      EXTERNAL_HANDSHAKE_TIMEOUT_MS,
    );
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [externalPreviewNonce, externalPreviewRef, onError, previewOrigin, sessionId]);

  useEffect(() => {
    const iframeWindow = iframeRef.current?.contentWindow;
    if (!iframeWindow || !iframeHandshakeNonce) return undefined;

    const push = () => pushHandshake(iframeWindow, { portsRef, sessionId, previewOrigin, onError });
    push();
    const interval = window.setInterval(push, EXTERNAL_HANDSHAKE_INTERVAL_MS);
    const timeout = window.setTimeout(
      () => window.clearInterval(interval),
      EXTERNAL_HANDSHAKE_TIMEOUT_MS,
    );
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [iframeHandshakeNonce, iframeRef, onError, previewOrigin, sessionId]);

  return null;
}
