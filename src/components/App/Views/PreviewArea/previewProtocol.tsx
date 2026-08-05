import type {
  PreviewConnectMessage,
  PreviewRequestMessage,
  PreviewResponsePayload,
} from './preview-types';

export const PREVIEW_PROTOCOL_VERSION = 1;
export const PREVIEW_CONNECT = 'zakamurai-preview-connect';
/** Preview host → IDE: MessagePort was accepted; stop replacing handshake ports. */
export const PREVIEW_CONNECT_ACK = 'zakamurai-preview-connect-ack';
export const PREVIEW_REQUEST = 'preview-request';
export const PREVIEW_RESPONSE = 'preview-response';
export const PREVIEW_STREAM_START = 'preview-stream-start';
export const PREVIEW_STREAM_CHUNK = 'preview-stream-chunk';
export const PREVIEW_STREAM_END = 'preview-stream-end';

export const MAX_PREVIEW_BODY_BYTES = 2 * 1024 * 1024;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

function decodePreviewPath(path: string): string | null {
  let decoded = path;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return decoded;
      decoded = next;
    } catch {
      return null;
    }
  }
  return null;
}

export function isSafePreviewPath(path: unknown): path is string {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('\\')) return false;
  const decoded = decodePreviewPath(path);
  return decoded !== null && !decoded.includes('..') && !decoded.startsWith('//');
}

export function isPreviewRequest(
  message: PreviewRequestMessage | null | undefined,
  sessionId: string,
): message is PreviewRequestMessage {
  if (!message || message.type !== PREVIEW_REQUEST || message.sessionId !== sessionId) return false;
  if (!Number.isSafeInteger(message.id) || message.id < 1) return false;
  if (!SAFE_METHODS.has(message.method) || !isSafePreviewPath(message.path)) return false;
  return (
    !message.bodyBase64 || message.bodyBase64.length <= Math.ceil(MAX_PREVIEW_BODY_BYTES * 1.34)
  );
}

export function toBase64(bytes: Uint8Array | ArrayLike<number>): string {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = '';
  for (let index = 0; index < input.length; index += 0x8000) {
    binary += String.fromCharCode(...input.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(value: string | null | undefined): Uint8Array {
  if (!value) return new Uint8Array();
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export type { PreviewConnectMessage, PreviewRequestMessage, PreviewResponsePayload };
