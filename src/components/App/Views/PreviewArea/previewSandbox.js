/** Message protocol for sandboxed preview → parent runtime errors. */
export const PREVIEW_MESSAGE_SOURCE = 'zakamurai-preview';

export const PREVIEW_MESSAGE_TYPES = {
  RUNTIME_ERROR: 'runtime-error',
  UNHANDLED_REJECTION: 'unhandled-rejection',
  NAVIGATE: 'navigate',
};

/**
 * Inline script injected into preview HTML so runtime errors still reach the parent
 * when the iframe is sandboxed without allow-same-origin.
 */
export const PREVIEW_ERROR_BRIDGE_SCRIPT = `(function(){
  if (window.__zakamuraiPreviewBridge) return;
  window.__zakamuraiPreviewBridge = true;
  var SRC = ${JSON.stringify(PREVIEW_MESSAGE_SOURCE)};
  function post(type, message, extra) {
    try {
      parent.postMessage(Object.assign({ source: SRC, type: type, message: message || '' }, extra || {}), '*');
    } catch (_e) {}
  }
  window.addEventListener('error', function (event) {
    var msg = event && event.message ? event.message : 'Script error';
    if (event && event.filename) msg += ' at ' + event.filename + ':' + (event.lineno || 0);
    post(${JSON.stringify(PREVIEW_MESSAGE_TYPES.RUNTIME_ERROR)}, msg);
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    var msg = reason && reason.message ? reason.message : String(reason || 'Unhandled rejection');
    post(${JSON.stringify(PREVIEW_MESSAGE_TYPES.UNHANDLED_REJECTION)}, msg);
  });
  try {
    post(${JSON.stringify(PREVIEW_MESSAGE_TYPES.NAVIGATE)}, '', { path: location.pathname || '' });
  } catch (_e) {}
})();`;

export function injectPreviewErrorBridge(html) {
  if (typeof html !== 'string' || !html) return html;
  if (html.includes('__zakamuraiPreviewBridge')) return html;
  const scriptTag = `<script>${PREVIEW_ERROR_BRIDGE_SCRIPT}</script>`;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${scriptTag}</head>`);
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${scriptTag}</body>`);
  }
  return `${html}${scriptTag}`;
}

export function parsePreviewMessage(data) {
  if (!data || typeof data !== 'object' || data.source !== PREVIEW_MESSAGE_SOURCE) {
    return null;
  }
  if (!Object.values(PREVIEW_MESSAGE_TYPES).includes(data.type)) {
    return null;
  }
  return data;
}

/**
 * Allow only same-app preview paths. Reject absolute URLs, protocol-relative,
 * traversal, and anything outside a `/preview` namespace (optionally under a base path).
 */
export function sanitizePreviewPath(path) {
  if (typeof path !== 'string' || !path) return null;
  const trimmed = path.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//')) return null;
  if (trimmed.includes('\\')) return null;
  if (trimmed.includes('..')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;
  // /preview, /preview/..., or /{base}/preview/...
  if (!/^(?:\/[^/]+)*\/preview(?:\/.*)?$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Accept preview bridge messages only from the preview iframe window.
 * Opaque sandboxed iframes report origin "null".
 */
export function isTrustedPreviewMessage(event, iframeWindow) {
  if (!event || !iframeWindow) return false;
  if (event.source !== iframeWindow) return false;
  const origin = event.origin;
  if (origin && origin !== 'null' && typeof window !== 'undefined') {
    // Same-origin preview (sandbox not opaque) must match the IDE origin.
    if (origin !== window.location.origin) return false;
  }
  return !!parsePreviewMessage(event.data);
}
