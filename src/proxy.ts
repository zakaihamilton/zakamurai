import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  PREVIEW_HOST_PATH,
  PREVIEW_SURFACE_PARAM,
  PREVIEW_SURFACE_VALUE,
  getPreviewFrameAncestors,
  isPreviewHost,
  isVercelAppHost,
} from './components/App/Views/PreviewArea/previewOrigins';

function getPreviewOriginUrl(): URL {
  try {
    const configured = new URL(
      process.env.NEXT_PUBLIC_PREVIEW_ORIGIN || 'https://preview.zakamurai.com',
    );
    if (configured.protocol !== 'http:' && configured.protocol !== 'https:') throw new Error();
    return configured;
  } catch {
    return new URL('https://preview.zakamurai.com');
  }
}

const previewOriginUrl = getPreviewOriginUrl();

function isPreviewHostRequest(request: NextRequest): boolean {
  const host = request.headers.get('host');
  const previewOrigins = {
    ideOrigin: null,
    previewOrigin: previewOriginUrl.origin,
    isIsolated: true,
  };
  return isPreviewHost(host, previewOrigins);
}

function isVercelSurfaceHost(request: NextRequest): boolean {
  const host = request.headers.get('host');
  if (!host) return false;
  try {
    return isVercelAppHost(new URL(`https://${host}`).hostname);
  } catch {
    return false;
  }
}

function isLocalDevHost(request: NextRequest): boolean {
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function isPreviewSurfaceRequest(request: NextRequest): boolean {
  if (isPreviewHostRequest(request)) return true;
  const hasSurfaceSignal =
    request.headers.get('x-zakamurai-surface') === 'preview' ||
    request.nextUrl.searchParams.get(PREVIEW_SURFACE_PARAM) === PREVIEW_SURFACE_VALUE ||
    isPreviewBootstrapPath(request.nextUrl.pathname) ||
    isPreviewVirtualPath(request.nextUrl.pathname);
  if (!hasSurfaceSignal) return false;

  // Single-port local development serves preview on the IDE origin with a surface
  // query (see getPreviewOrigins). Without this, /__preview/host 404s as a normal
  // Next route and the iframe shows "This page could not be found."
  if (isLocalDevHost(request)) return true;

  const configuredIdeOrigin = process.env.NEXT_PUBLIC_IDE_ORIGIN;
  if (
    configuredIdeOrigin &&
    isPreviewHost(request.headers.get('host'), {
      ideOrigin: configuredIdeOrigin,
      previewOrigin: configuredIdeOrigin,
      isIsolated: false,
    })
  ) {
    return true;
  }

  const branchOrigin = toHostOrigin(process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL);
  return Boolean(
    (branchOrigin &&
      isPreviewHost(request.headers.get('host'), {
        ideOrigin: branchOrigin,
        previewOrigin: branchOrigin,
        isIsolated: false,
      })) ||
      isVercelSurfaceHost(request),
  );
}

function resolveIdeOriginForPreviewHeaders(request: NextRequest): string | null {
  const hostHeader = request.headers.get('host') || '';
  const hostname = hostHeader.split(':')[0];
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const portSuffix = hostHeader.includes(':') ? `:${hostHeader.split(':')[1]}` : '';
  if (hostname.startsWith('preview.')) {
    return `${proto}://${hostname.slice('preview.'.length)}${portSuffix}`;
  }
  if (request.nextUrl.searchParams.get(PREVIEW_SURFACE_PARAM) === PREVIEW_SURFACE_VALUE) {
    return `${proto}://${hostname}${portSuffix}`;
  }
  return toHostOrigin(process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL);
}

function withIdeHeaders(response: NextResponse): NextResponse {
  // Retain WindowProxy references to preview popups that opt out with
  // Cross-Origin-Opener-Policy: unsafe-none (see withPreviewHeaders).
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  return response;
}

function withPreviewHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const ideOrigin = resolveIdeOriginForPreviewHeaders(request);

  response.headers.set(
    'Content-Security-Policy',
    `frame-ancestors ${getPreviewFrameAncestors({ ideOrigin })}`,
  );
  response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  response.headers.set('Referrer-Policy', 'no-referrer');
  // IDE uses COOP: same-origin-allow-popups. That only retains popup references
  // when the popup opts out with unsafe-none — otherwise window.open's
  // WindowProxy is severed and the MessagePort handshake never arrives.
  response.headers.set('Cross-Origin-Opener-Policy', 'unsafe-none');
  return response;
}

function toHostOrigin(host: string | undefined): string | null {
  if (typeof host !== 'string' || !host.trim()) return null;
  try {
    return new URL(host.includes('://') ? host : `https://${host}`).origin;
  } catch {
    return null;
  }
}

function isPreviewBootstrapPath(pathname: string): boolean {
  return pathname === PREVIEW_HOST_PATH || pathname.startsWith(`${PREVIEW_HOST_PATH}/`);
}

function isPreviewVirtualPath(pathname: string): boolean {
  return pathname.startsWith('/__preview/') && !isPreviewBootstrapPath(pathname);
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isPreviewSurface = isPreviewSurfaceRequest(request);
  if (!isPreviewSurface) return withIdeHeaders(NextResponse.next());
  if (
    pathname === '/__preview_sw__.js' ||
    pathname === '/preview-error-bridge.js' ||
    pathname === '/isolated-preview-test.html' ||
    pathname.startsWith('/_next/')
  ) {
    const response = NextResponse.next();
    response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    // Preview asset responses should not re-isolate the tab if a document
    // navigation somehow shares this path; COOP only matters on documents.
    return response;
  }

  // Session preview documents are served by the preview service worker. If the
  // worker missed the navigation, do not rewrite into PreviewHost (that looped
  // "Connecting isolated preview…").
  if (isPreviewVirtualPath(pathname)) {
    return withPreviewHeaders(
      new NextResponse('Preview service worker is not controlling this page. Rebuild to retry.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
      request,
    );
  }

  // Already on the handshake route — do not rewrite /preview-host → /preview-host/preview-host.
  if (pathname === '/preview-host' || pathname.startsWith('/preview-host/')) {
    return withPreviewHeaders(NextResponse.next(), request);
  }

  const url = request.nextUrl.clone();
  if (pathname === '/' || isPreviewBootstrapPath(pathname)) {
    url.pathname = '/preview-host';
  } else {
    url.pathname = `/preview-host${pathname}`;
  }
  return withPreviewHeaders(NextResponse.rewrite(url), request);
}

export const config = {
  matcher: [
    '/((?!api|__preview_sw\\.js|preview-error-bridge\\.js|_next/static|_next/image|favicon.ico).*)',
  ],
};
