import { NextRequest } from 'next/server';
import { proxy } from '../src/proxy';

type HeaderReader = {
  get(name: string): string | null;
};

export function assertPreviewSurfaceHeaders(
  headers: HeaderReader,
  previewUrl: string,
  ideOrigins: string[],
): void {
  const csp = headers.get('content-security-policy') || '';
  if (!csp.includes('frame-ancestors')) {
    throw new Error(`Preview surface ${previewUrl} is missing frame-ancestors CSP`);
  }

  for (const ideOrigin of ideOrigins) {
    const host = new URL(ideOrigin).host;
    if (!csp.includes(host)) {
      throw new Error(`Preview surface frame-ancestors is missing IDE host ${host}`);
    }
  }

  const corp = headers.get('cross-origin-resource-policy');
  if (corp !== 'cross-origin') {
    throw new Error(
      `Preview surface ${previewUrl} must send Cross-Origin-Resource-Policy: cross-origin`,
    );
  }

  const coop = headers.get('cross-origin-opener-policy');
  if (coop !== 'unsafe-none') {
    throw new Error(
      `Preview surface ${previewUrl} must send Cross-Origin-Opener-Policy: unsafe-none (got ${coop}) so the IDE can retain window.open for the MessagePort handshake`,
    );
  }
}

export function verifyLocalProxyPreviewSurface(previewUrl: string, ideOrigins: string[]): void {
  const parsedUrl = new URL(previewUrl);
  const request = new NextRequest(parsedUrl, {
    headers: {
      host: parsedUrl.host,
      'x-forwarded-proto': parsedUrl.protocol.replace(/:$/, ''),
      'x-zakamurai-surface': 'preview',
    },
  });
  const response = proxy(request);
  assertPreviewSurfaceHeaders(response.headers, `${previewUrl} (local proxy)`, ideOrigins);
}

async function main(): Promise<void> {
  const explicitOrigin = process.env.PREVIEW_SMOKE_ORIGIN?.trim();
  const requireRemote = process.env.PREVIEW_SMOKE_REQUIRE_REMOTE === '1';
  const previewOrigin = explicitOrigin || 'https://preview.zakamurai.com';
  const ideOrigins = (
    process.env.PREVIEW_SMOKE_IDE_ORIGINS || 'https://www.zakamurai.com,https://zakamurai.com'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const previewUrl = `${previewOrigin.replace(/\/$/, '')}/?session=smoke`;

  let response: Response;
  try {
    response = await fetch(previewUrl, { method: 'GET', redirect: 'follow' });
  } catch (error) {
    if (explicitOrigin || requireRemote) {
      throw error;
    }
    verifyLocalProxyPreviewSurface(previewUrl, ideOrigins);
    console.log(
      `Remote ${previewUrl} unreachable (${error instanceof Error ? error.message : String(error)}); verified preview surface headers via local proxy.`,
    );
    return;
  }

  if (!response.ok) {
    throw new Error(`Preview surface ${previewUrl} returned ${response.status}`);
  }

  assertPreviewSurfaceHeaders(response.headers, previewUrl, ideOrigins);
  console.log(`Preview surface check passed for ${previewUrl}`);
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]?.endsWith('check-preview-surfaces.ts'));

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
