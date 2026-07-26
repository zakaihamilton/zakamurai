const trimOrigin = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

export function getPreviewOrigins({ windowOrigin } = {}) {
  const localIdeOrigin = 'http://localhost:3000';
  const localPreviewOrigin = 'http://localhost:3001';
  const isLocal = windowOrigin?.startsWith('http://localhost:');
  const configuredIdeOrigin = trimOrigin(process.env.NEXT_PUBLIC_IDE_ORIGIN);
  const configuredPreviewOrigin = trimOrigin(process.env.NEXT_PUBLIC_PREVIEW_ORIGIN);
  const ideOrigin = configuredIdeOrigin || (isLocal ? localIdeOrigin : null);
  const previewOrigin = configuredPreviewOrigin || (isLocal ? localPreviewOrigin : null);

  return { ideOrigin, previewOrigin, isIsolated: ideOrigin !== previewOrigin };
}

export function getPreviewConfigurationError(origins) {
  if (!origins?.ideOrigin || !origins?.previewOrigin) {
    return 'Preview origins are not configured. Set NEXT_PUBLIC_IDE_ORIGIN and NEXT_PUBLIC_PREVIEW_ORIGIN.';
  }
  if (!origins.isIsolated) {
    return 'Preview origin must be different from the IDE origin.';
  }
  return null;
}

export function isPreviewHost(host, { previewOrigin } = getPreviewOrigins()) {
  if (!host || !previewOrigin) return false;
  try {
    return host.split(':')[0].toLowerCase() === new URL(previewOrigin).hostname.toLowerCase();
  } catch {
    return false;
  }
}

export function createPreviewSession() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}
