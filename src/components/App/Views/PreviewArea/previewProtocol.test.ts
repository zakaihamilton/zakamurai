import { describe, expect, it } from 'vitest';
import { fromBase64, isPreviewRequest, isSafePreviewPath, toBase64 } from './previewProtocol';

describe('previewProtocol', () => {
  it('validates safe preview paths', () => {
    expect(isSafePreviewPath('/index.html')).toBe(true);
    expect(isSafePreviewPath('/assets/app.js')).toBe(true);
    expect(isSafePreviewPath('index.html')).toBe(false);
    expect(isSafePreviewPath('/../etc/passwd')).toBe(false);
    expect(isSafePreviewPath('/%2e%2e/passwd')).toBe(false);
    expect(isSafePreviewPath('//malicious.com')).toBe(false);
    expect(isSafePreviewPath('/path\\with\\backslash')).toBe(false);
    expect(isSafePreviewPath(123)).toBe(false);
    expect(isSafePreviewPath('/%E0%A4%A')).toBe(false); // malformed URI
  });

  it('validates preview requests', () => {
    const validReq = {
      type: 'preview-request',
      sessionId: 's1',
      id: 1,
      method: 'GET',
      path: '/index.html',
    };
    expect(isPreviewRequest(validReq, 's1')).toBe(true);
    expect(isPreviewRequest(null, 's1')).toBe(false);
    expect(isPreviewRequest({ ...validReq, sessionId: 's2' }, 's1')).toBe(false);
    expect(isPreviewRequest({ ...validReq, id: -1 }, 's1')).toBe(false);
    expect(isPreviewRequest({ ...validReq, method: 'INVALID' }, 's1')).toBe(false);
    expect(isPreviewRequest({ ...validReq, path: 'unsafe' }, 's1')).toBe(false);
    expect(isPreviewRequest({ ...validReq, bodyBase64: 'a'.repeat(3 * 1024 * 1024) }, 's1')).toBe(
      false,
    );
  });

  it('converts byte arrays to base64 and back', () => {
    const input = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const b64 = toBase64(input);
    expect(typeof b64).toBe('string');
    const decoded = fromBase64(b64);
    expect(Array.from(decoded)).toEqual([72, 101, 108, 108, 111]);

    expect(Array.from(fromBase64(''))).toEqual([]);
    expect(toBase64(null as unknown as Uint8Array)).toBe('');
  });
});
