import { describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => {
  class MockNextResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status || 200;
      this.headers = new Map();
    }
    static next() {
      const res = new MockNextResponse(null);
      res.type = 'next';
      return res;
    }
    static rewrite(url) {
      const res = new MockNextResponse(null);
      res.type = 'rewrite';
      res.url = url;
      return res;
    }
  }
  return { NextResponse: MockNextResponse };
});

import { proxy } from './proxy';

function createMockRequest(urlStr, headersObj = {}) {
  const url = new URL(urlStr);
  const headers = new Map(Object.entries(headersObj));
  return {
    nextUrl: {
      pathname: url.pathname,
      clone: () => new URL(urlStr),
    },
    headers: {
      get: (key) => headers.get(key.toLowerCase()) || headers.get(key) || null,
    },
  };
}

describe('proxy', () => {
  it('returns default next response for non-preview requests', () => {
    const req = createMockRequest('https://www.zakamurai.com/editor', {
      host: 'www.zakamurai.com',
    });
    const res = proxy(req);
    expect(res.type).toBe('next');
    expect(res.headers.get('Content-Security-Policy')).toBeUndefined();
  });

  it('handles missing or empty host header', () => {
    const req = createMockRequest('https://www.zakamurai.com/editor', {});
    const res = proxy(req);
    expect(res.type).toBe('next');
  });

  it('handles host header with explicit port', () => {
    const req = createMockRequest('https://preview.zakamurai.com:443/editor', {
      host: 'preview.zakamurai.com:443',
    });
    const res = proxy(req);
    expect(res.type).toBe('rewrite');
  });

  it('handles preview host requests matching preview origin hostname', () => {
    const req = createMockRequest('https://preview.zakamurai.com/', {
      host: 'preview.zakamurai.com',
    });
    const res = proxy(req);
    expect(res.type).toBe('rewrite');
    expect(res.url.pathname).toBe('/preview-host');
    expect(res.headers.get('Content-Security-Policy')).toBe(
      'frame-ancestors https://www.zakamurai.com http://localhost:3000',
    );
  });

  it('handles x-zakamurai-surface preview header', () => {
    const req = createMockRequest('https://www.zakamurai.com/subpath', {
      host: 'www.zakamurai.com',
      'x-zakamurai-surface': 'preview',
    });
    const res = proxy(req);
    expect(res.type).toBe('rewrite');
    expect(res.url.pathname).toBe('/preview-host/subpath');
  });

  it('bypasses rewrite for internal preview assets like /__preview_sw__.js', () => {
    const req = createMockRequest('https://preview.zakamurai.com/__preview_sw__.js', {
      host: 'preview.zakamurai.com',
    });
    const res = proxy(req);
    expect(res.type).toBe('next');
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
  });

  it('returns 503 for uncached /__preview/ paths', () => {
    const req = createMockRequest(
      'https://preview.zakamurai.com/__preview/session-123/index.html',
      {
        host: 'preview.zakamurai.com',
      },
    );
    const res = proxy(req);
    expect(res.status).toBe(503);
    expect(res.body).toContain('Preview service worker is not controlling this page');
  });

  it('returns next response without rewriting when already on /preview-host', () => {
    const req = createMockRequest('https://preview.zakamurai.com/preview-host/subpath', {
      host: 'preview.zakamurai.com',
    });
    const res = proxy(req);
    expect(res.type).toBe('next');
    expect(res.headers.get('Content-Security-Policy')).toBeDefined();
  });
});
