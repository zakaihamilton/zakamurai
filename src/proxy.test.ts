import { createMockProxyRequest } from '@/test-utils/domMocks';
import type { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

type MockNextResponse = {
  body: string | null;
  status: number;
  headers: Map<string, string>;
  type?: string;
  url?: URL;
};

vi.mock('next/server', () => {
  class MockNextResponse {
    body: string | null;
    status: number;
    headers: Map<string, string>;
    type?: string;
    url?: URL;

    constructor(body: string | null, init: { status?: number } = {}) {
      this.body = body;
      this.status = init.status || 200;
      this.headers = new Map();
    }
    static next(): MockNextResponse {
      const res = new MockNextResponse(null);
      res.type = 'next';
      return res;
    }
    static rewrite(url: URL): MockNextResponse {
      const res = new MockNextResponse(null);
      res.type = 'rewrite';
      res.url = url;
      return res;
    }
  }
  return { NextResponse: MockNextResponse };
});

import { proxy } from './proxy';

describe('proxy', () => {
  it('returns default next response for non-preview requests', () => {
    const req = createMockProxyRequest('https://www.zakamurai.com/editor', {
      host: 'www.zakamurai.com',
    });
    const res = proxy(req as unknown as NextRequest) as unknown as MockNextResponse;
    expect(res.type).toBe('next');
    expect(res.headers.get('Content-Security-Policy')).toBeUndefined();
  });

  it('does not treat the local IDE port as the preview surface', async () => {
    vi.stubEnv('NEXT_PUBLIC_PREVIEW_ORIGIN', 'http://localhost:3001');
    vi.resetModules();
    const { proxy: localProxy } = await import('./proxy');
    const req = createMockProxyRequest('http://localhost:3000/', {
      host: 'localhost:3000',
    });
    const res = localProxy(req as unknown as NextRequest) as unknown as MockNextResponse;
    expect(res.type).toBe('next');
    expect(res.headers.get('Content-Security-Policy')).toBeUndefined();
    vi.unstubAllEnvs();
    vi.resetModules();
    await import('./proxy');
  });

  it('treats the local preview port as the preview surface', async () => {
    vi.stubEnv('NEXT_PUBLIC_PREVIEW_ORIGIN', 'http://localhost:3001');
    vi.resetModules();
    const { proxy: localProxy } = await import('./proxy');
    const req = createMockProxyRequest('http://localhost:3001/', {
      host: 'localhost:3001',
    });
    const res = localProxy(req as unknown as NextRequest) as unknown as MockNextResponse;
    expect(res.type).toBe('rewrite');
    expect(res.url?.pathname).toBe('/preview-host');
    vi.unstubAllEnvs();
    vi.resetModules();
    await import('./proxy');
  });

  it('handles missing or empty host header', () => {
    const req = createMockProxyRequest('https://www.zakamurai.com/editor', {});
    const res = proxy(req as unknown as NextRequest) as unknown as MockNextResponse;
    expect(res.type).toBe('next');
  });

  it('handles host header with explicit port', () => {
    const req = createMockProxyRequest('https://preview.zakamurai.com:443/editor', {
      host: 'preview.zakamurai.com:443',
    });
    const res = proxy(req as unknown as NextRequest) as unknown as MockNextResponse;
    expect(res.type).toBe('rewrite');
  });

  it('handles preview host requests matching preview origin hostname', () => {
    const req = createMockProxyRequest('https://preview.zakamurai.com/', {
      host: 'preview.zakamurai.com',
    });
    const res = proxy(req as unknown as NextRequest) as unknown as MockNextResponse;
    expect(res.type).toBe('rewrite');
    expect(res.url?.pathname).toBe('/preview-host');
    expect(res.headers.get('Content-Security-Policy')).toContain('frame-ancestors');
    expect(res.headers.get('Content-Security-Policy')).toContain('http://localhost:3000');
    expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('unsafe-none');
  });

  it('sets same-origin-allow-popups COOP on IDE surfaces', () => {
    const req = createMockProxyRequest('https://www.zakamurai.com/editor', {
      host: 'www.zakamurai.com',
    });
    const res = proxy(req as unknown as NextRequest) as unknown as MockNextResponse;
    expect(res.type).toBe('next');
    expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');
  });

  it('handles zakamurai-surface preview query on Vercel branch hosts', () => {
    const req = createMockProxyRequest(
      'https://zakamurai-git-feature-team.vercel.app/__preview/host?session=test&zakamurai-surface=preview',
      { host: 'zakamurai-git-feature-team.vercel.app' },
    );
    const res = proxy(req as unknown as NextRequest) as unknown as MockNextResponse;
    expect(res.type).toBe('rewrite');
    expect(res.url?.pathname).toBe('/preview-host');
    expect(res.headers.get('Content-Security-Policy')).toContain(
      'https://zakamurai-git-feature-team.vercel.app',
    );
  });

  it('returns 503 for uncached /__preview virtual paths on Vercel branch hosts', () => {
    const req = createMockProxyRequest(
      'https://zakamurai-git-feature-team.vercel.app/__preview/session-123/dist/index.html',
      { host: 'zakamurai-git-feature-team.vercel.app' },
    );
    const res = proxy(req as unknown as NextRequest) as unknown as MockNextResponse;
    expect(res.status).toBe(503);
    expect(res.body).toContain('Preview service worker is not controlling this page');
  });

  it('handles x-zakamurai-surface preview header', () => {
    const req = createMockProxyRequest('https://www.zakamurai.com/subpath', {
      host: 'www.zakamurai.com',
      'x-zakamurai-surface': 'preview',
    });
    const res = proxy(req as unknown as NextRequest) as unknown as MockNextResponse;
    expect(res.type).toBe('rewrite');
    expect(res.url?.pathname).toBe('/preview-host/subpath');
  });

  it('bypasses rewrite for internal preview assets like /__preview_sw__.js', () => {
    const req = createMockProxyRequest('https://preview.zakamurai.com/__preview_sw__.js', {
      host: 'preview.zakamurai.com',
    });
    const res = proxy(req as unknown as NextRequest) as unknown as MockNextResponse;
    expect(res.type).toBe('next');
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
  });

  it('returns 503 for uncached /__preview/ paths', () => {
    const req = createMockProxyRequest(
      'https://preview.zakamurai.com/__preview/session-123/index.html',
      {
        host: 'preview.zakamurai.com',
      },
    );
    const res = proxy(req as unknown as NextRequest) as unknown as MockNextResponse;
    expect(res.status).toBe(503);
    expect(res.body).toContain('Preview service worker is not controlling this page');
  });

  it('returns next response without rewriting when already on /preview-host', () => {
    const req = createMockProxyRequest('https://preview.zakamurai.com/preview-host/subpath', {
      host: 'preview.zakamurai.com',
    });
    const res = proxy(req as unknown as NextRequest) as unknown as MockNextResponse;
    expect(res.type).toBe('next');
    expect(res.headers.get('Content-Security-Policy')).toBeDefined();
  });
});
