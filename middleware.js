import { NextResponse } from 'next/server';

const previewHost = new URL(
  process.env.NEXT_PUBLIC_PREVIEW_ORIGIN || 'https://preview.zakamurai.com',
).hostname;

export function middleware(request) {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase();
  const isPreviewSurface =
    host === previewHost || request.headers.get('x-zakamurai-surface') === 'preview';
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

  const url = request.nextUrl.clone();
  url.pathname = pathname === '/' ? '/preview-host' : `/preview-host${pathname}`;
  const response = NextResponse.rewrite(url);
  response.headers.set(
    'Content-Security-Policy',
    'frame-ancestors https://www.zakamurai.com http://localhost:3000',
  );
  response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export const config = {
  matcher: [
    '/((?!api|__preview_sw\\.js|preview-error-bridge\\.js|_next/static|_next/image|favicon.ico).*)',
  ],
};
