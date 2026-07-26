import { describe, expect, it } from 'vitest';
import { getPreviewConfigurationError, getPreviewOrigins, isPreviewHost } from './previewOrigins';
import { isPreviewRequest, isSafePreviewPath } from './previewProtocol';

describe('isolated preview configuration', () => {
  it('uses distinct local origins for the two-port development workflow', () => {
    const origins = getPreviewOrigins({ windowOrigin: 'http://localhost:3000' });
    expect(origins.ideOrigin).toBe('http://localhost:3000');
    expect(origins.previewOrigin).toBe('http://localhost:3001');
    expect(getPreviewConfigurationError(origins)).toBeNull();
  });

  it('recognizes only the configured preview host', () => {
    const origins = { previewOrigin: 'https://preview.zakamurai.com' };
    expect(isPreviewHost('preview.zakamurai.com', origins)).toBe(true);
    expect(isPreviewHost('www.zakamurai.com', origins)).toBe(false);
  });
});

describe('isolated preview protocol', () => {
  it('accepts bounded virtual requests inside the preview namespace', () => {
    expect(isSafePreviewPath('/dist/index.html')).toBe(true);
    expect(
      isPreviewRequest(
        {
          type: 'preview-request',
          sessionId: 'session',
          id: 1,
          method: 'GET',
          path: '/dist/index.html',
        },
        'session',
      ),
    ).toBe(true);
  });

  it('rejects traversal, external paths, invalid methods, and mismatched sessions', () => {
    expect(isSafePreviewPath('/../settings')).toBe(false);
    expect(isSafePreviewPath('//example.com')).toBe(false);
    expect(
      isPreviewRequest(
        {
          type: 'preview-request',
          sessionId: 'other',
          id: 1,
          method: 'TRACE',
          path: '/dist/index.html',
        },
        'session',
      ),
    ).toBe(false);
  });
});
