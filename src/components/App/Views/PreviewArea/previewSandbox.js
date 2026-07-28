/** Message protocol for sandboxed preview → parent runtime errors. */
export const PREVIEW_MESSAGE_SOURCE = 'zakamurai-preview';

export const PREVIEW_MESSAGE_TYPES = {
  RUNTIME_ERROR: 'runtime-error',
  UNHANDLED_REJECTION: 'unhandled-rejection',
  NAVIGATE: 'navigate',
  EVIDENCE: 'evidence',
  RECONNECT: 'reconnect',
};

/**
 * Preview iframe sandbox tokens.
 *
 * The preview is hosted on a different origin and uses its own scoped service
 * worker. `allow-same-origin` preserves that distinct preview origin so its
 * service worker and exact-origin message checks can operate; it does not
 * grant access to the IDE's different origin.
 */
export const PREVIEW_IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups';

/**
 * Inline script injected into preview HTML so runtime errors still reach the parent
 * when same-origin DOM access is unavailable (defense in depth alongside SW injection).
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
    setTimeout(function () {
      var text = (document.body && document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 4000);
      var elements = Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,button,a,input,[role]'), 0, 80).map(function(el) {
        return (el.getAttribute('role') || el.tagName.toLowerCase()) + ': ' + (el.getAttribute('aria-label') || el.innerText || el.value || '').replace(/\s+/g, ' ').slice(0, 160);
      }).filter(Boolean);
      post(${JSON.stringify(PREVIEW_MESSAGE_TYPES.EVIDENCE)}, '', { path: location.pathname || '', title: document.title || '', text: text, elements: elements, screenshotCaptured: false });
      try {
        var markup = new XMLSerializer().serializeToString(document.documentElement);
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.min(window.innerWidth, 1440) + '" height="' + Math.min(window.innerHeight, 1200) + '"><foreignObject width="100%" height="100%">' + markup.replace(/&/g, '&amp;').replace(/#/g, '%23') + '</foreignObject></svg>';
        var image = new Image();
        image.onload = function () {
          try {
            var canvas = document.createElement('canvas');
            canvas.width = Math.min(window.innerWidth, 1440); canvas.height = Math.min(window.innerHeight, 1200);
            canvas.getContext('2d').drawImage(image, 0, 0);
            var screenshot = canvas.toDataURL('image/png');
            if (screenshot.length < 500000) post(${JSON.stringify(PREVIEW_MESSAGE_TYPES.EVIDENCE)}, '', { path: location.pathname || '', title: document.title || '', text: text, elements: elements, screenshotCaptured: true, screenshot: screenshot });
          } catch (_captureError) {}
        };
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      } catch (_captureSetupError) {}
    }, 250);
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
  const parsed = {
    ...data,
    message: data.message == null ? '' : String(data.message),
    path: data.path == null ? data.path : String(data.path),
  };
  if (data.type === PREVIEW_MESSAGE_TYPES.EVIDENCE) {
    parsed.title = data.title == null ? '' : String(data.title).slice(0, 300);
    parsed.text = data.text == null ? '' : String(data.text).slice(0, 4000);
    parsed.elements = Array.isArray(data.elements) ? data.elements.slice(0, 80).map(String) : [];
    parsed.screenshotCaptured = Boolean(data.screenshotCaptured);
    parsed.screenshot =
      typeof data.screenshot === 'string' && data.screenshot.startsWith('data:image/')
        ? data.screenshot.slice(0, 500000)
        : '';
  }
  return parsed;
}

/**
 * Allow only same-app preview paths. Reject absolute URLs, protocol-relative,
 * traversal (including encoded forms), and anything outside a `/preview` namespace.
 */
export function sanitizePreviewPath(path) {
  if (typeof path !== 'string' || !path) return null;
  let trimmed = path.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//')) return null;
  if (trimmed.includes('\\')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;

  try {
    trimmed = decodeURIComponent(trimmed);
  } catch {
    return null;
  }

  if (trimmed.includes('\\') || trimmed.includes('..')) return null;
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  // /preview, /preview/..., or /{base}/preview/...
  if (!/^(?:\/[^/]+)*\/preview(?:\/.*)?$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Accept preview bridge messages only from the preview iframe window.
 * Same-origin previews must match the IDE origin; opaque frames report "null".
 */
export function isTrustedPreviewMessage(event, iframeWindow, trustedOrigin = null) {
  if (!event || !iframeWindow) return false;
  if (event.source !== iframeWindow) return false;
  const origin = event.origin;
  if (origin && origin !== 'null') {
    if (trustedOrigin) {
      if (origin !== trustedOrigin) return false;
    } else if (typeof window !== 'undefined' && origin !== window.location.origin) {
      return false;
    }
  }
  return !!parsePreviewMessage(event.data);
}
