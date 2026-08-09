const LOCAL_IDE_ORIGIN = 'http://localhost:3000';
const PREVIEW_HOST_PREFIX = 'preview.';
export const PREVIEW_SURFACE_PARAM = 'zakamurai-surface';
export const PREVIEW_SURFACE_VALUE = 'preview';
export const PREVIEW_SERVICE_WORKER_SCOPE = '/__preview/';
export const PREVIEW_HOST_PATH = '/__preview/host';

export type PreviewOrigins = {
  ideOrigin: string | null;
  previewOrigin: string | null;
  isIsolated: boolean;
  useSurfaceQuery?: boolean;
};

export type PreviewHandshakeEvent = MessageEvent<{
  type?: string;
  version?: string | number;
  sessionId?: string;
}>;

const trimOrigin = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
};

const toHostOrigin = (host: unknown): string | null => {
  if (typeof host !== 'string' || !host.trim()) return null;
  return trimOrigin(host.includes('://') ? host : `https://${host}`);
};

export function expandOriginAliases(origin: unknown): string[] {
  const normalized = trimOrigin(origin);
  if (!normalized) return [];
  try {
    const url = new URL(normalized);
    const aliases = new Set([url.origin]);
    const { hostname, protocol, port } = url;
    const portSuffix = port ? `:${port}` : '';
    if (hostname.startsWith('www.')) {
      aliases.add(`${protocol}//${hostname.slice(4)}${portSuffix}`);
    } else if (!hostname.includes('localhost') && hostname.includes('.')) {
      aliases.add(`${protocol}//www.${hostname}${portSuffix}`);
    }
    return [...aliases];
  } catch {
    return [normalized];
  }
}

export function originMatches(
  candidate: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!candidate || !expected) return false;
  if (candidate === expected) return true;
  const expectedAliases = new Set(expandOriginAliases(expected));
  return expectedAliases.has(candidate);
}

const isLocalOrigin = (windowOrigin: string | undefined) =>
  windowOrigin?.startsWith('http://localhost:') || windowOrigin?.startsWith('http://127.0.0.1:');

const matchesConfiguredOrigins = (
  windowOrigin: string | undefined,
  ideOrigin: string | null,
  previewOrigin: string | null,
): boolean => {
  if (!windowOrigin) return false;
  const windowAliases = expandOriginAliases(windowOrigin);
  const configuredAliases = new Set([
    ...expandOriginAliases(ideOrigin),
    ...expandOriginAliases(previewOrigin),
  ]);
  return windowAliases.some((alias) => configuredAliases.has(alias));
};

export function isVercelAppHost(hostname: string): boolean {
  return typeof hostname === 'string' && hostname.toLowerCase().endsWith('.vercel.app');
}

function getVercelDeploymentOrigins(windowOrigin: string): PreviewOrigins | null {
  if (!windowOrigin || !isVercelAppHost(new URL(windowOrigin).hostname)) return null;

  // A path or service-worker scope cannot isolate origin-wide storage. Fail
  // closed on branch deployments instead of executing workspace code beside
  // the IDE's localStorage, IndexedDB, cookies, and parent DOM.
  return {
    ideOrigin: windowOrigin,
    previewOrigin: null,
    isIsolated: false,
  };
}

export function buildPreviewUrl(
  origins: PreviewOrigins | null | undefined,
  sessionId: string | null,
): string | null {
  if (!origins?.previewOrigin || !sessionId) return null;
  const url = new URL(origins.useSurfaceQuery ? PREVIEW_HOST_PATH : '/', origins.previewOrigin);
  url.searchParams.set('session', sessionId);
  if (origins.useSurfaceQuery) {
    url.searchParams.set(PREVIEW_SURFACE_PARAM, PREVIEW_SURFACE_VALUE);
  }
  return url.toString();
}

export function getPreviewServiceWorkerScope(origins: PreviewOrigins | null | undefined): string {
  return origins?.useSurfaceQuery ? PREVIEW_SERVICE_WORKER_SCOPE : '/';
}

export function derivePreviewHostFromIde(ideOrigin: string): string {
  const url = new URL(ideOrigin);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    url.port = url.port === '3000' ? '3001' : url.port || '3001';
    return url.origin;
  }
  if (url.hostname.startsWith(PREVIEW_HOST_PREFIX)) return url.origin;
  url.hostname = `${PREVIEW_HOST_PREFIX}${url.hostname}`;
  return url.origin;
}

export function deriveIdeHostFromPreview(previewOrigin: string): string {
  const url = new URL(previewOrigin);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    url.port = url.port === '3001' ? '3000' : url.port || '3000';
    return url.origin;
  }
  if (url.hostname.startsWith(PREVIEW_HOST_PREFIX)) {
    url.hostname = url.hostname.slice(PREVIEW_HOST_PREFIX.length);
    return url.origin;
  }
  return previewOrigin;
}

function getSubdomainBranchOrigins(windowOrigin: string): PreviewOrigins | null {
  const hostname = new URL(windowOrigin).hostname;
  if (isVercelAppHost(hostname)) return null;
  if (hostname.startsWith(PREVIEW_HOST_PREFIX)) {
    const previewOrigin = windowOrigin;
    const ideOrigin = deriveIdeHostFromPreview(windowOrigin);
    return { ideOrigin, previewOrigin, isIsolated: ideOrigin !== previewOrigin };
  }
  const ideOrigin = windowOrigin;
  const previewOrigin = derivePreviewHostFromIde(windowOrigin);
  return { ideOrigin, previewOrigin, isIsolated: ideOrigin !== previewOrigin };
}

export function getPreviewOrigins({
  windowOrigin,
}: { windowOrigin?: string } = {}): PreviewOrigins {
  const configuredIdeOrigin = trimOrigin(process.env.NEXT_PUBLIC_IDE_ORIGIN);
  const configuredPreviewOrigin = trimOrigin(process.env.NEXT_PUBLIC_PREVIEW_ORIGIN);

  if (
    matchesConfiguredOrigins(windowOrigin, configuredIdeOrigin, configuredPreviewOrigin) &&
    configuredIdeOrigin &&
    configuredPreviewOrigin
  ) {
    return {
      ideOrigin: configuredIdeOrigin,
      previewOrigin: configuredPreviewOrigin,
      isIsolated: configuredIdeOrigin !== configuredPreviewOrigin,
    };
  }

  if (isLocalOrigin(windowOrigin)) {
    if (configuredIdeOrigin && configuredPreviewOrigin) {
      return {
        ideOrigin: configuredIdeOrigin,
        previewOrigin: configuredPreviewOrigin,
        isIsolated: configuredIdeOrigin !== configuredPreviewOrigin,
      };
    }
    if (configuredPreviewOrigin) {
      const ideOrigin = windowOrigin || LOCAL_IDE_ORIGIN;
      return {
        ideOrigin,
        previewOrigin: configuredPreviewOrigin,
        isIsolated: ideOrigin !== configuredPreviewOrigin,
      };
    }
    try {
      if (windowOrigin) {
        const url = new URL(windowOrigin);
        if (url.port === '3001') {
          const ideOrigin = deriveIdeHostFromPreview(windowOrigin);
          return {
            ideOrigin,
            previewOrigin: windowOrigin,
            isIsolated: ideOrigin !== windowOrigin,
          };
        }
      }
    } catch {
      // Ignore URL parsing failure
    }
    const localOrigin = windowOrigin || LOCAL_IDE_ORIGIN;
    return {
      ideOrigin: localOrigin,
      previewOrigin: localOrigin,
      isIsolated: false,
      useSurfaceQuery: true,
    };
  }

  const vercelDeploymentOrigins = windowOrigin ? getVercelDeploymentOrigins(windowOrigin) : null;
  if (vercelDeploymentOrigins) {
    return vercelDeploymentOrigins;
  }

  if (windowOrigin) {
    const subdomainOrigins = getSubdomainBranchOrigins(windowOrigin);
    if (subdomainOrigins) return subdomainOrigins;
  }

  if (configuredIdeOrigin && configuredPreviewOrigin) {
    return {
      ideOrigin: configuredIdeOrigin,
      previewOrigin: configuredPreviewOrigin,
      isIsolated: configuredIdeOrigin !== configuredPreviewOrigin,
    };
  }

  return { ideOrigin: null, previewOrigin: null, isIsolated: false };
}

export function getPreviewConfigurationError(
  origins: PreviewOrigins | null | undefined,
): string | null {
  if (!origins?.ideOrigin || !origins?.previewOrigin) {
    return 'Preview origins are not configured. Set NEXT_PUBLIC_IDE_ORIGIN and NEXT_PUBLIC_PREVIEW_ORIGIN.';
  }
  if (!origins.isIsolated && !origins.useSurfaceQuery) {
    return 'Preview origin must be different from the IDE origin.';
  }
  return null;
}

export function getPreviewFrameAncestors({
  ideOrigin,
}: { ideOrigin?: string | null } = {}): string {
  const ancestors = new Set([LOCAL_IDE_ORIGIN]);
  const configuredIdeOrigin = trimOrigin(process.env.NEXT_PUBLIC_IDE_ORIGIN);
  const vercelBranchOrigin = toHostOrigin(process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL);
  for (const origin of [
    configuredIdeOrigin,
    vercelBranchOrigin,
    ideOrigin,
    ...expandOriginAliases(configuredIdeOrigin),
    ...expandOriginAliases(vercelBranchOrigin),
    ...expandOriginAliases(ideOrigin),
  ]) {
    if (origin) ancestors.add(origin);
  }
  return [...ancestors].join(' ');
}

/**
 * Validates the one-time cross-origin preview handshake before a MessagePort
 * is accepted. Keep this check shared by the IDE bridge and preview host so
 * neither side can accidentally relax the protocol independently.
 */
export function isValidPreviewHandshake(
  event: PreviewHandshakeEvent | null | undefined,
  {
    expectedOrigin,
    expectedSource,
    sessionId,
    type,
    version,
  }: {
    expectedOrigin: string;
    expectedSource: MessageEventSource | null;
    sessionId: string;
    type: string;
    version: string | number;
  },
): boolean {
  return Boolean(
    event &&
      expectedOrigin &&
      sessionId &&
      event.origin === expectedOrigin &&
      event.source === expectedSource &&
      event.data &&
      event.data.type === type &&
      String(event.data.version) === String(version) &&
      event.data.sessionId === sessionId,
  );
}

export function isPreviewHost(
  host: string | null | undefined,
  { previewOrigin } = getPreviewOrigins(),
): boolean {
  if (!host) return false;
  try {
    if (!previewOrigin) return false;
    const rawHost = host.trim();
    if (!rawHost || /[\/?#@]/.test(rawHost)) return false;
    const configuredOrigin = new URL(previewOrigin);
    const hostOrigin = new URL(`${configuredOrigin.protocol}//${rawHost}`);
    return (
      hostOrigin.hostname.toLowerCase() === configuredOrigin.hostname.toLowerCase() &&
      hostOrigin.port === configuredOrigin.port
    );
  } catch {
    return false;
  }
}

export function createPreviewSession() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}
