import { NextResponse } from 'next/server';
import {
  getPreviewFrameAncestors,
  isPreviewHost,
} from './components/App/Views/PreviewArea/previewOrigins';

const previewOriginUrl = new URL(
  process.env.NEXT_PUBLIC_PREVIEW_ORIGIN || 'https://preview.zakamurai.com',
);
const previewHost = previewOriginUrl.hostname;

function isPreviewHostRequest(request) {
  const hostHeader = request.headers.get('host')?.toLowerCase() || '';
  const hostname = hostHeader.split(':')[0];
  const requestPort = hostHeader.includes(':') ? hostHeader.split(':')[1] : '';
  const previewPort = previewOriginUrl.port;
  const hostnameMatch = hostname === previewHost.toLowerCase();
  // When the preview origin includes an explicit port (local isolated preview),
  // require it so localhost:3000 is not treated as localhost:3001.
  const portMatch = previewPort ? requestPort === previewPort : true;
  if (hostnameMatch && portMatch) return true;
  return isPreviewHost(hostname);
}

function withPreviewHeaders(response, request) {
  const hostHeader = request.headers.get('host') || '';
  const hostname = hostHeader.split(':')[0];
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const portSuffix = hostHeader.includes(':') ? `:${hostHeader.split(':')[1]}` : '';
  const ideOrigin = hostname.startsWith('preview.')
    ? `${proto}://${hostname.slice('preview.'.length)}${portSuffix}`
    : toHostOrigin(process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL);

  response.headers.set(
    'Content-Security-Policy',
    `frame-ancestors ${getPreviewFrameAncestors({ ideOrigin })}`,
  );
  response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

function toHostOrigin(host) {
  if (typeof host !== 'string' || !host.trim()) return null;
  try {
    return new URL(host.includes('://') ? host : `https://${host}`).origin;
  } catch {
    return null;
  }
}

export function proxy(request) {
  const isPreviewSurface =
    isPreviewHostRequest(request) || request.headers.get('x-zakamurai-surface') === 'preview';
  if (!isPreviewSurface) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (
    pathname === '/__preview_sw__.js' ||
    pathname === '/preview-error-bridge.js' ||
    pathname === '/isolated-preview-test.html' ||
    pathname.startsWith('/_next/')
  ) {
    const response = NextResponse.next();
    response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return response;
  }

  // Session preview documents are served by the preview service worker. If the
  // worker missed the navigation, do not rewrite into PreviewHost (that looped
  // "Connecting isolated preview…").
  if (pathname.startsWith('/__preview/')) {
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
  url.pathname = pathname === '/' ? '/preview-host' : `/preview-host${pathname}`;
  return withPreviewHeaders(NextResponse.rewrite(url), request);
}

export const config = {
  matcher: [
    '/((?!api|__preview_sw\\.js|preview-error-bridge\\.js|_next/static|_next/image|favicon.ico).*)',
  ],
};
