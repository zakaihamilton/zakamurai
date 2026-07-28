const LOCAL_IDE_ORIGIN = 'http://localhost:3000';
const LOCAL_PREVIEW_ORIGIN = 'http://localhost:3001';
const PREVIEW_HOST_PREFIX = 'preview.';
export const PREVIEW_SURFACE_PARAM = 'zakamurai-surface';
export const PREVIEW_SURFACE_VALUE = 'preview';
const PREVIEW_SERVICE_WORKER_SCOPE = '/__preview/';

const trimOrigin = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const toHostOrigin = (host) => {
  if (typeof host !== 'string' || !host.trim()) return null;
  return trimOrigin(host.includes('://') ? host : `https://${host}`);
};

export function expandOriginAliases(origin) {
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

export function originMatches(candidate, expected) {
  if (!candidate || !expected) return false;
  if (candidate === expected) return true;
  const expectedAliases = new Set(expandOriginAliases(expected));
  return expectedAliases.has(candidate);
}

const isLocalOrigin = (windowOrigin) =>
  windowOrigin?.startsWith('http://localhost:') || windowOrigin?.startsWith('http://127.0.0.1:');

const matchesConfiguredOrigins = (windowOrigin, ideOrigin, previewOrigin) => {
  if (!windowOrigin) return false;
  const windowAliases = expandOriginAliases(windowOrigin);
  const configuredAliases = new Set([
    ...expandOriginAliases(ideOrigin),
    ...expandOriginAliases(previewOrigin),
  ]);
  return windowAliases.some((alias) => configuredAliases.has(alias));
};

export function isVercelAppHost(hostname) {
  return typeof hostname === 'string' && hostname.toLowerCase().endsWith('.vercel.app');
}

function getVercelSurfaceOrigins(windowOrigin) {
  if (!windowOrigin || !isVercelAppHost(new URL(windowOrigin).hostname)) return null;
  return {
    ideOrigin: windowOrigin,
    previewOrigin: windowOrigin,
    isIsolated: false,
    useSurfaceQuery: true,
  };
}

export function buildPreviewUrl(origins, sessionId) {
  if (!origins?.previewOrigin || !sessionId) return null;
  const url = new URL('/', origins.previewOrigin);
  url.searchParams.set('session', sessionId);
  if (origins.useSurfaceQuery) {
    url.searchParams.set(PREVIEW_SURFACE_PARAM, PREVIEW_SURFACE_VALUE);
  }
  return url.toString();
}

export function getPreviewServiceWorkerScope(origins) {
  return origins?.useSurfaceQuery ? PREVIEW_SERVICE_WORKER_SCOPE : '/';
}

export function derivePreviewHostFromIde(ideOrigin) {
  const url = new URL(ideOrigin);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    url.port = url.port === '3000' ? '3001' : url.port || '3001';
    return url.origin;
  }
  if (url.hostname.startsWith(PREVIEW_HOST_PREFIX)) return url.origin;
  url.hostname = `${PREVIEW_HOST_PREFIX}${url.hostname}`;
  return url.origin;
}

export function deriveIdeHostFromPreview(previewOrigin) {
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

function getSubdomainBranchOrigins(windowOrigin) {
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

export function getPreviewOrigins({ windowOrigin } = {}) {
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
    return {
      ideOrigin: LOCAL_IDE_ORIGIN,
      previewOrigin: LOCAL_PREVIEW_ORIGIN,
      isIsolated: true,
    };
  }

  const vercelSurfaceOrigins = getVercelSurfaceOrigins(windowOrigin);
  if (vercelSurfaceOrigins) {
    return vercelSurfaceOrigins;
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

export function getPreviewConfigurationError(origins) {
  if (!origins?.ideOrigin || !origins?.previewOrigin) {
    return 'Preview origins are not configured. Set NEXT_PUBLIC_IDE_ORIGIN and NEXT_PUBLIC_PREVIEW_ORIGIN.';
  }
  if (!origins.isIsolated && !origins.useSurfaceQuery) {
    return 'Preview origin must be different from the IDE origin.';
  }
  return null;
}

export function getPreviewFrameAncestors({ ideOrigin } = {}) {
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
  event,
  { expectedOrigin, expectedSource, sessionId, type, version },
) {
  return Boolean(
    event &&
      event.origin === expectedOrigin &&
      event.source === expectedSource &&
      event.data &&
      event.data.type === type &&
      event.data.version === version &&
      event.data.sessionId === sessionId,
  );
}

export function isPreviewHost(host, { previewOrigin } = getPreviewOrigins()) {
  if (!host) return false;
  try {
    const normalizedHost = host.split(':')[0].toLowerCase();

    if (normalizedHost.startsWith(PREVIEW_HOST_PREFIX)) return true;

    if (!previewOrigin) return false;
    return normalizedHost === new URL(previewOrigin).hostname.toLowerCase();
  } catch {
    return false;
  }
}

export function createPreviewSession() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}
