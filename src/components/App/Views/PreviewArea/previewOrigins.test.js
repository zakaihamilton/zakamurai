import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deriveIdeHostFromPreview,
  derivePreviewHostFromIde,
  expandOriginAliases,
  getPreviewConfigurationError,
  getPreviewFrameAncestors,
  getPreviewOrigins,
  isPreviewHost,
  isValidPreviewHandshake,
  originMatches,
} from './previewOrigins';
import { isPreviewRequest, isSafePreviewPath } from './previewProtocol';

describe('isolated preview configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses distinct local origins for the two-port development workflow', () => {
    const origins = getPreviewOrigins({ windowOrigin: 'http://localhost:3000' });
    expect(origins.ideOrigin).toBe('http://localhost:3000');
    expect(origins.previewOrigin).toBe('http://localhost:3001');
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

  it('uses Vercel branch and deployment URLs when the current domain does not match production', () => {
    vi.stubEnv('NEXT_PUBLIC_IDE_ORIGIN', 'https://www.zakamurai.com');
    vi.stubEnv('NEXT_PUBLIC_PREVIEW_ORIGIN', 'https://preview.zakamurai.com');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_BRANCH_URL', 'zakamurai-git-feature-team.vercel.app');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_URL', 'zakamurai-abc123-team.vercel.app');

    const origins = getPreviewOrigins({
      windowOrigin: 'https://zakamurai-git-feature-team.vercel.app',
    });
    expect(origins).toEqual({
      ideOrigin: 'https://zakamurai-git-feature-team.vercel.app',
      previewOrigin: 'https://zakamurai-abc123-team.vercel.app',
      isIsolated: true,
    });
  });

  it('treats the Vercel deployment URL as the preview surface for branch deployments', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_BRANCH_URL', 'zakamurai-git-feature-team.vercel.app');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_URL', 'zakamurai-abc123-team.vercel.app');

    const origins = getPreviewOrigins({
      windowOrigin: 'https://zakamurai-abc123-team.vercel.app',
    });
    expect(origins.previewOrigin).toBe('https://zakamurai-abc123-team.vercel.app');
    expect(origins.ideOrigin).toBe('https://zakamurai-git-feature-team.vercel.app');
  });

  it('derives preview and IDE hosts from a preview subdomain when no Vercel URLs exist', () => {
    const origins = getPreviewOrigins({ windowOrigin: 'https://preview.example.com' });
    expect(origins).toEqual({
      ideOrigin: 'https://example.com',
      previewOrigin: 'https://preview.example.com',
      isIsolated: true,
    });
  });

  it('recognizes configured, Vercel deployment, and preview-prefixed hosts', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_URL', 'zakamurai-abc123-team.vercel.app');

    const origins = { previewOrigin: 'https://preview.zakamurai.com' };
    expect(isPreviewHost('preview.zakamurai.com', origins)).toBe(true);
    expect(isPreviewHost('www.zakamurai.com', origins)).toBe(false);
    expect(isPreviewHost('zakamurai-abc123-team.vercel.app', origins)).toBe(true);
    expect(isPreviewHost('preview.branch.example.com', origins)).toBe(true);
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
  });

  it('maps preview subdomains back to IDE hosts', () => {
    expect(derivePreviewHostFromIde('https://branch.example.com')).toBe(
      'https://preview.branch.example.com',
    );
    expect(deriveIdeHostFromPreview('https://preview.branch.example.com')).toBe(
      'https://branch.example.com',
    );
  });

  it('treats apex and www hosts as aliases', () => {
    expect(expandOriginAliases('https://www.zakamurai.com')).toEqual([
      'https://www.zakamurai.com',
      'https://zakamurai.com',
    ]);
    expect(originMatches('https://zakamurai.com', 'https://www.zakamurai.com')).toBe(true);
    expect(originMatches('https://preview.zakamurai.com', 'https://www.zakamurai.com')).toBe(false);
  });
});

describe('isValidPreviewHandshake', () => {
  const source = {};
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
        },
        options,
      ),
    ).toBe(true);
    expect(
      isValidPreviewHandshake(
        {
          origin: 'https://attacker.example',
          source,
          data: { type: 'connect', version: 1, sessionId: 'session' },
        },
        options,
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
