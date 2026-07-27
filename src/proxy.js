import { NextResponse } from 'next/server';

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
  return hostnameMatch && portMatch;
}

function withPreviewHeaders(response) {
  response.headers.set(
    'Content-Security-Policy',
    'frame-ancestors https://www.zakamurai.com http://localhost:3000',
  );
  response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
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
    );
  }

  // Already on the handshake route — do not rewrite /preview-host → /preview-host/preview-host.
  if (pathname === '/preview-host' || pathname.startsWith('/preview-host/')) {
    return withPreviewHeaders(NextResponse.next());
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === '/' ? '/preview-host' : `/preview-host${pathname}`;
  return withPreviewHeaders(NextResponse.rewrite(url));
}

export const config = {
  matcher: [
    '/((?!api|__preview_sw\\.js|preview-error-bridge\\.js|_next/static|_next/image|favicon.ico).*)',
  ],
};
