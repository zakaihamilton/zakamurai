import { Compiler } from '@/utils/compiler';
import type { PreviewRequestMessage, PreviewResponsePayload } from './preview-types';
import {
  PREVIEW_RESPONSE,
  PREVIEW_STREAM_CHUNK,
  PREVIEW_STREAM_END,
  PREVIEW_STREAM_START,
  isPreviewRequest,
  toBase64,
} from './previewProtocol';

const STREAM_CHUNK_SIZE = 64 * 1024;

function toResponsePayload(response: {
  body?: Uint8Array | ArrayLike<number>;
  statusCode?: number;
  statusMessage?: string;
  headers?: Record<string, string>;
}): PreviewResponsePayload {
  const body =
    response?.body instanceof Uint8Array ? response.body : new Uint8Array(response?.body || []);
  return {
    statusCode: response?.statusCode || 500,
    statusMessage: response?.statusMessage || 'Internal Server Error',
    headers: response?.headers || { 'Content-Type': 'text/plain' },
    body,
  };
}

async function handleRequest(message: PreviewRequestMessage): Promise<PreviewResponsePayload> {
  const container = Compiler.getContainer();
  if (!container?.serverBridge) {
    throw new Error('Preview server is not ready. Build the project again.');
  }
  const body = message.bodyBase64
    ? Uint8Array.from(atob(message.bodyBase64), (char) => char.charCodeAt(0))
    : null;
  const bridge = container.serverBridge as typeof container.serverBridge & {
    handleRequest: (
      port: number,
      method: string,
      path: string,
      headers: Record<string, string>,
      body: Uint8Array | null,
    ) => Promise<{
      body?: Uint8Array | ArrayLike<number>;
      statusCode?: number;
      statusMessage?: string;
      headers?: Record<string, string>;
    }>;
  };
  return toResponsePayload(
    await bridge.handleRequest(3000, message.method, message.path, message.headers || {}, body),
  );
}

export function bindPortHandler(
  port: MessagePort,
  {
    sessionId,
    onError,
    onFirstRequest,
  }: {
    sessionId: string;
    onError?: (message: string) => void;
    onFirstRequest?: (port: MessagePort) => void;
  },
) {
  let sawRequest = false;
  port.onmessage = async ({ data: request }: MessageEvent<PreviewRequestMessage>) => {
    if (!isPreviewRequest(request, sessionId)) return;
    if (!sawRequest) {
      sawRequest = true;
      onFirstRequest?.(port);
    }
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
      port.postMessage({ type: PREVIEW_RESPONSE, id: request.id, sessionId, error: message });
      onError?.(message);
    }
  };
}
