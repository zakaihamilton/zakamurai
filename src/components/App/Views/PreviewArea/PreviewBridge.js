import { Compiler } from '@/utils/compiler';
import { useEffect, useRef } from 'react';
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
import { isValidPreviewHandshake } from './previewOrigins';

const STREAM_CHUNK_SIZE = 64 * 1024;

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

/** Bridges an isolated preview service worker to the local almostnode server. */
export default function PreviewBridge({
  iframeRef,
  externalPreviewRef,
  sessionId,
  previewOrigin,
  onError,
}) {
  const portsRef = useRef(new Map());

  useEffect(() => {
    const closePort = (source) => {
      const port = portsRef.current.get(source);
      port?.close();
      portsRef.current.delete(source);
    };

    const onMessage = (event) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      const externalPreviewWindow = externalPreviewRef?.current;
      const expectedSource =
        event.source === externalPreviewWindow ? externalPreviewWindow : iframeWindow;
      if (
        !isValidPreviewHandshake(event, {
          expectedOrigin: previewOrigin,
          expectedSource,
          sessionId,
          type: PREVIEW_CONNECT,
          version: PREVIEW_PROTOCOL_VERSION,
        })
      )
        return;
      closePort(event.source);
      const channel = new MessageChannel();
      portsRef.current.set(event.source, channel.port1);
      channel.port1.onmessage = async ({ data: request }) => {
        if (!isPreviewRequest(request, sessionId)) return;
        try {
          const response = await handleRequest(request);
          if (request.streaming) {
            channel.port1.postMessage({
              type: PREVIEW_STREAM_START,
              id: request.id,
              sessionId,
              statusCode: response.statusCode,
              statusMessage: response.statusMessage,
              headers: response.headers,
            });
            for (let offset = 0; offset < response.body.length; offset += STREAM_CHUNK_SIZE) {
              channel.port1.postMessage({
                type: PREVIEW_STREAM_CHUNK,
                id: request.id,
                sessionId,
                chunkBase64: toBase64(response.body.subarray(offset, offset + STREAM_CHUNK_SIZE)),
              });
            }
            channel.port1.postMessage({ type: PREVIEW_STREAM_END, id: request.id, sessionId });
            return;
          }
          channel.port1.postMessage({
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
          channel.port1.postMessage({
            type: PREVIEW_RESPONSE,
            id: request.id,
            sessionId,
            error: message,
          });
          onError?.(message);
        }
      };
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

  return null;
}
