import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PreviewOrigins } from './previewOrigins';
import {
  buildPreviewUrl,
  deriveIdeHostFromPreview,
  derivePreviewHostFromIde,
  expandOriginAliases,
  getPreviewConfigurationError,
  getPreviewFrameAncestors,
  getPreviewOrigins,
  getPreviewServiceWorkerScope,
  isPreviewHost,
  isValidPreviewHandshake,
  originMatches,
} from './previewOrigins';
import { isPreviewRequest, isSafePreviewPath } from './previewProtocol';

function previewOrigins(
  partial: Partial<PreviewOrigins> & Pick<PreviewOrigins, 'previewOrigin'>,
): PreviewOrigins {
  const { previewOrigin, ...rest } = partial;
  return {
    ideOrigin: null,
    isIsolated: true,
    ...rest,
    previewOrigin,
  };
}

describe('isolated preview configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses distinct local origins for the two-port development workflow when configured', () => {
    vi.stubEnv('NEXT_PUBLIC_IDE_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('NEXT_PUBLIC_PREVIEW_ORIGIN', 'http://localhost:3001');

    const origins = getPreviewOrigins({ windowOrigin: 'http://localhost:3000' });
    expect(origins.ideOrigin).toBe('http://localhost:3000');
    expect(origins.previewOrigin).toBe('http://localhost:3001');
    expect(origins.isIsolated).toBe(true);
    expect(getPreviewConfigurationError(origins)).toBeNull();
  });

  it('uses surface query preview for single-port localhost development when preview origin is not configured', () => {
    const origins = getPreviewOrigins({ windowOrigin: 'http://localhost:3000' });
    expect(origins.ideOrigin).toBe('http://localhost:3000');
    expect(origins.previewOrigin).toBe('http://localhost:3000');
    expect(origins.isIsolated).toBe(false);
    expect(origins.useSurfaceQuery).toBe(true);
    expect(getPreviewConfigurationError(origins)).toBeNull();
  });

  it('uses configured production origins when the current window matches them', () => {
    vi.stubEnv('NEXT_PUBLIC_IDE_ORIGIN', 'https://www.zakamurai.com');
    vi.stubEnv('NEXT_PUBLIC_PREVIEW_ORIGIN', 'https://preview.zakamurai.com');

    const origins = getPreviewOrigins({ windowOrigin: 'https://www.zakamurai.com' });
    expect(origins).toEqual({
      ideOrigin: 'https://www.zakamurai.com',
      previewOrigin: 'https://preview.zakamurai.com',
      isIsolated: true,
    });
  });

  it('treats apex and www IDE hosts as configured production origins', () => {
    vi.stubEnv('NEXT_PUBLIC_IDE_ORIGIN', 'https://www.zakamurai.com');
    vi.stubEnv('NEXT_PUBLIC_PREVIEW_ORIGIN', 'https://preview.zakamurai.com');

    const origins = getPreviewOrigins({ windowOrigin: 'https://zakamurai.com' });
    expect(origins).toEqual({
      ideOrigin: 'https://www.zakamurai.com',
      previewOrigin: 'https://preview.zakamurai.com',
      isIsolated: true,
    });
  });

  it('fails closed instead of running previews on configured Vercel branch IDE origins', () => {
    vi.stubEnv('NEXT_PUBLIC_IDE_ORIGIN', 'https://www.zakamurai.com');
    vi.stubEnv('NEXT_PUBLIC_PREVIEW_ORIGIN', 'https://preview.zakamurai.com');

    const windowOrigin = 'https://zakamurai-git-feature-team.vercel.app';
    const origins = getPreviewOrigins({ windowOrigin });
    expect(origins).toEqual({
      ideOrigin: windowOrigin,
      previewOrigin: null,
      isIsolated: false,
    });
    expect(getPreviewConfigurationError(origins)).toContain('not configured');
    expect(buildPreviewUrl(origins, 'session-123')).toBeNull();
    expect(getPreviewServiceWorkerScope(origins)).toBe('/');
  });

  it('uses a same-origin preview surface for unconfigured Vercel deployments', () => {
    const windowOrigin = 'https://zakamurai-nlxp189a3-zakai-hamiltons-projects.vercel.app';
    const origins = getPreviewOrigins({ windowOrigin });
    expect(origins).toEqual({
      ideOrigin: windowOrigin,
      previewOrigin: windowOrigin,
      isIsolated: false,
      useSurfaceQuery: true,
    });
    expect(getPreviewConfigurationError(origins)).toBeNull();
    expect(buildPreviewUrl(origins, 'session-123')).toBe(
      `${windowOrigin}/__preview/host?session=session-123&zakamurai-surface=preview`,
    );
  });

  it('does not use the fallback when an origin variable is partially configured', () => {
    vi.stubEnv('NEXT_PUBLIC_IDE_ORIGIN', 'https://www.zakamurai.com');
    const windowOrigin = 'https://zakamurai-nlxp189a3-zakai-hamiltons-projects.vercel.app';
    const origins = getPreviewOrigins({ windowOrigin });
    expect(origins.previewOrigin).toBeNull();
    expect(getPreviewConfigurationError(origins)).toContain('not configured');
  });

  it('derives preview and IDE hosts from a preview subdomain when no Vercel URLs exist', () => {
    const origins = getPreviewOrigins({ windowOrigin: 'https://preview.example.com' });
    expect(origins).toEqual({
      ideOrigin: 'https://example.com',
      previewOrigin: 'https://preview.example.com',
      isIsolated: true,
    });
  });

  it('recognizes only the configured preview host', () => {
    const origins = previewOrigins({ previewOrigin: 'https://preview.zakamurai.com' });
    expect(isPreviewHost('preview.zakamurai.com', origins)).toBe(true);
    expect(isPreviewHost('preview.zakamurai.com:bad-port', origins)).toBe(false);
    expect(isPreviewHost('www.zakamurai.com', origins)).toBe(false);
    expect(isPreviewHost('preview.branch.example.com', origins)).toBe(false);
  });

  it('includes configured and branch IDE origins in preview frame ancestors', () => {
    vi.stubEnv('NEXT_PUBLIC_IDE_ORIGIN', 'https://www.zakamurai.com');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_BRANCH_URL', 'zakamurai-git-feature-team.vercel.app');

    const ancestors = getPreviewFrameAncestors({
      ideOrigin: 'https://zakamurai-git-feature-team.vercel.app',
    });
    expect(ancestors).toContain('http://localhost:3000');
    expect(ancestors).toContain('https://www.zakamurai.com');
    expect(ancestors).toContain('https://zakamurai-git-feature-team.vercel.app');
  });
});

describe('preview host derivation helpers', () => {
  it('maps localhost IDE and preview ports', () => {
    expect(derivePreviewHostFromIde('http://localhost:3000')).toBe('http://localhost:3001');
    expect(deriveIdeHostFromPreview('http://localhost:3001')).toBe('http://localhost:3000');
    expect(derivePreviewHostFromIde('http://127.0.0.1:4000')).toBe('http://127.0.0.1:4000');
    expect(deriveIdeHostFromPreview('http://127.0.0.1:4000')).toBe('http://127.0.0.1:4000');
    expect(derivePreviewHostFromIde('http://localhost')).toBe('http://localhost:3001');
    expect(deriveIdeHostFromPreview('http://localhost')).toBe('http://localhost:3000');
  });

  it('maps preview subdomains back to IDE hosts', () => {
    expect(derivePreviewHostFromIde('https://branch.example.com')).toBe(
      'https://preview.branch.example.com',
    );
    expect(deriveIdeHostFromPreview('https://preview.branch.example.com')).toBe(
      'https://branch.example.com',
    );
    expect(derivePreviewHostFromIde('https://preview.example.com')).toBe(
      'https://preview.example.com',
    );
    expect(deriveIdeHostFromPreview('https://example.com')).toBe('https://example.com');
  });

  it('treats apex and www hosts as aliases', () => {
    expect(expandOriginAliases('https://www.zakamurai.com')).toEqual([
      'https://www.zakamurai.com',
      'https://zakamurai.com',
    ]);
    expect(expandOriginAliases('')).toEqual([]);
    expect(expandOriginAliases('not a url')).toEqual([]);
    expect(expandOriginAliases('javascript:alert(1)')).toEqual([]);
    expect(expandOriginAliases('https://zakamurai.com:443')).toEqual([
      'https://zakamurai.com',
      'https://www.zakamurai.com',
    ]);
    expect(originMatches('https://zakamurai.com', 'https://www.zakamurai.com')).toBe(true);
    expect(originMatches('https://preview.zakamurai.com', 'https://www.zakamurai.com')).toBe(false);
    expect(originMatches(null, 'https://www.zakamurai.com')).toBe(false);
    expect(originMatches('https://www.zakamurai.com', null)).toBe(false);
    expect(originMatches('https://a.com', 'https://a.com')).toBe(true);
  });

  it('handles buildPreviewUrl and configuration error edges', () => {
    expect(buildPreviewUrl(null, 's')).toBeNull();
    expect(buildPreviewUrl(previewOrigins({ previewOrigin: 'https://p.example' }), '')).toBeNull();
    expect(buildPreviewUrl(previewOrigins({ previewOrigin: 'https://p.example' }), 'abc')).toBe(
      'https://p.example/?session=abc',
    );
    expect(getPreviewConfigurationError(null)).toContain('not configured');
    expect(
      getPreviewConfigurationError({
        ideOrigin: 'https://a.com',
        previewOrigin: 'https://a.com',
        isIsolated: false,
      }),
    ).toContain('must be different');
    expect(
      getPreviewServiceWorkerScope({
        ideOrigin: null,
        previewOrigin: null,
        isIsolated: false,
      }),
    ).toBe('/');
  });

  it('falls back to configured origins and rejects invalid hosts', () => {
    vi.stubEnv('NEXT_PUBLIC_IDE_ORIGIN', 'https://ide.example.com');
    vi.stubEnv('NEXT_PUBLIC_PREVIEW_ORIGIN', 'https://preview.example.com');
    expect(getPreviewOrigins({})).toEqual({
      ideOrigin: 'https://ide.example.com',
      previewOrigin: 'https://preview.example.com',
      isIsolated: true,
    });
    expect(
      isPreviewHost('', previewOrigins({ previewOrigin: 'https://preview.example.com' })),
    ).toBe(false);
    expect(
      isPreviewHost('www.example.com', {
        ideOrigin: null,
        previewOrigin: null,
        isIsolated: false,
      }),
    ).toBe(false);
    expect(isPreviewHost('::::', previewOrigins({ previewOrigin: 'not-a-url' }))).toBe(false);
  });
});

describe('isValidPreviewHandshake', () => {
  const source = {} as MessageEventSource;
  const options = {
    expectedOrigin: 'https://preview.example',
    expectedSource: source,
    sessionId: 'session',
    type: 'connect',
    version: 1,
  };

  it('accepts only the expected origin, source, session and protocol', () => {
    expect(
      isValidPreviewHandshake(
        {
          origin: 'https://preview.example',
          source,
          data: { type: 'connect', version: 1, sessionId: 'session' },
        } as MessageEvent,
        options,
      ),
    ).toBe(true);
    expect(
      isValidPreviewHandshake(
        {
          origin: 'https://attacker.example',
          source,
          data: { type: 'connect', version: 1, sessionId: 'session' },
        } as MessageEvent,
        options,
      ),
    ).toBe(false);
    expect(
      isValidPreviewHandshake(
        {
          origin: 'not-an-origin',
          source,
          data: { type: 'connect', version: 1, sessionId: 'session' },
        } as MessageEvent,
        options,
      ),
    ).toBe(false);
    expect(
      isValidPreviewHandshake(
        {
          origin: 'https://preview.example',
          source,
          data: { type: 'connect', version: 1, sessionId: '' },
        } as MessageEvent,
        { ...options, sessionId: '' },
      ),
    ).toBe(false);
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
    expect(isSafePreviewPath('/%252e%252e/settings')).toBe(false);
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
