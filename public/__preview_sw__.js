const pending = new Map();
let mainPort = null;
let activeSessionId = null;
let ideOrigin = null;
let nextId = 0;

const bytesToBase64 = (bytes) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};
const base64ToBytes = (value) => Uint8Array.from(atob(value || ''), (char) => char.charCodeAt(0));

// Do not skipWaiting on install. PreviewHost activates the worker explicitly
// before init so a freshly installed empty worker cannot claim clients and
// serve /__preview/* without a MessageChannel.
self.addEventListener('install', () => {});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === 'claim') {
    event.waitUntil(self.clients.claim());
    return;
  }
  if (
    event.data?.type !== 'init' ||
    !event.ports[0] ||
    !event.data.sessionId ||
    !event.data.ideOrigin
  )
    return;

  mainPort = event.ports[0];
  activeSessionId = event.data.sessionId;
  ideOrigin = event.data.ideOrigin;

  mainPort.onmessage = ({ data }) => {
    const pendingRequest = pending.get(data?.id);
    if (!pendingRequest || data.sessionId !== activeSessionId) return;
    if (data.type === 'preview-stream-start') {
      pendingRequest.statusCode = data.statusCode;
      pendingRequest.statusMessage = data.statusMessage;
      pendingRequest.headers = data.headers;
      return;
    }
    if (data.type === 'preview-stream-chunk') {
      pendingRequest.streamController?.enqueue(base64ToBytes(data.chunkBase64));
      return;
    }
    if (data.type === 'preview-stream-end') {
      pending.delete(data.id);
      pendingRequest.streamController?.close();
      pendingRequest.resolve({
        stream: pendingRequest.stream,
        statusCode: pendingRequest.statusCode || 200,
        statusMessage: pendingRequest.statusMessage || 'OK',
        headers: pendingRequest.headers || {},
      });
      return;
    }
    if (data.type === 'preview-response') {
      pending.delete(data.id);
      data.error ? pendingRequest.reject(new Error(data.error)) : pendingRequest.resolve(data);
    }
  };

  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const client = event.source;
      if (client) {
        client.postMessage({ type: 'init-ok', sessionId: activeSessionId });
      } else {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const windowClient of windows) {
          windowClient.postMessage({ type: 'init-ok', sessionId: activeSessionId });
        }
      }
    })(),
  );
});

function applyPreviewEmbedHeaders(headers) {
  // Parent IDE uses COEP require-corp. Cross-origin iframe documents must send
  // their own COEP header or Chrome blocks with coep-frame-resource-needs-coep-header.
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set(
    'Content-Security-Policy',
    "frame-ancestors 'self' http://localhost:3000 https://www.zakamurai.com",
  );
  headers.delete('X-Frame-Options');
  return headers;
}

function previewResponse(body, init = {}) {
  const headers = applyPreviewEmbedHeaders(new Headers(init.headers || {}));
  return new Response(body, { ...init, headers });
}

async function requestFromIde(request) {
  if (!mainPort || !activeSessionId) throw new Error('Isolated preview connection is not ready');
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Preview request timed out'));
    }, 30000);
    const pendingRequest = {
      resolve: (data) => {
        clearTimeout(timeout);
        resolve(data);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    };
    if (request.streaming) {
      pendingRequest.stream = new ReadableStream({
        start(controller) {
          pendingRequest.streamController = controller;
        },
        cancel() {
          pending.delete(id);
        },
      });
    }
    pending.set(id, pendingRequest);
    mainPort.postMessage({ ...request, type: 'preview-request', id, sessionId: activeSessionId });
  });
}

function contentTypeForPath(path) {
  const clean = path.split('?')[0].toLowerCase();
  if (clean.endsWith('.js') || clean.endsWith('.mjs') || clean.endsWith('.cjs')) {
    return 'application/javascript; charset=utf-8';
  }
  if (clean.endsWith('.css')) return 'text/css; charset=utf-8';
  if (clean.endsWith('.json')) return 'application/json; charset=utf-8';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  if (clean.endsWith('.wasm')) return 'application/wasm';
  if (clean.endsWith('.html') || clean.endsWith('.htm')) return 'text/html; charset=utf-8';
  if (clean.endsWith('.map')) return 'application/json; charset=utf-8';
  return null;
}

function injectBridge(bytes, headers, path) {
  const cleanPath = (path || '').split('?')[0].toLowerCase();
  const contentType = headers.get?.('Content-Type') || headers.get?.('content-type') || '';
  const isHtmlPath =
    cleanPath.endsWith('.html') || cleanPath.endsWith('.htm') || cleanPath.endsWith('/');
  if (!isHtmlPath && !String(contentType).includes('text/html')) return bytes;
  const html = new TextDecoder().decode(bytes);
  if (html.includes('preview-error-bridge.js')) return bytes;
  const bridge = `<script>window.__zakamuraiPreviewParentOrigin=${JSON.stringify(ideOrigin)};</script><script src="/preview-error-bridge.js"></script>`;
  const injected = /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${bridge}</head>`)
    : `${html}${bridge}`;
  return new TextEncoder().encode(injected);
}

async function handleVirtualRequest(request, path) {
  const headers = Object.fromEntries(request.headers.entries());
  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? null
      : bytesToBase64(new Uint8Array(await request.arrayBuffer()));
  const response = await requestFromIde({
    method: request.method,
    path,
    headers,
    bodyBase64: body,
    streaming: request.method === 'POST' && path.startsWith('/api/'),
  });
  const responseHeaders = applyPreviewEmbedHeaders(new Headers(response.headers || {}));
  const forcedType = contentTypeForPath(path);
  if (forcedType) responseHeaders.set('Content-Type', forcedType);
  if (response.stream) {
    return new Response(response.stream, {
      status: response.statusCode,
      statusText: response.statusMessage,
      headers: responseHeaders,
    });
  }
  const bytes = injectBridge(base64ToBytes(response.bodyBase64), responseHeaders, path);
  responseHeaders.set('Content-Length', String(bytes.length));
  return new Response(bytes, {
    status: response.statusCode,
    statusText: response.statusMessage,
    headers: responseHeaders,
  });
}

function lostConnectionPage() {
  return previewResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Preview</title>
<style>html,body{margin:0;height:100%;background:#101214;color:#e7ecef;font:14px/1.4 system-ui,sans-serif}
main{padding:2rem}</style></head>
<body><main><p>Preview connection was lost. Return to Zakamurai and click Build, then open Preview again.</p></main></body></html>`,
    {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/__preview/')) {
    if (!activeSessionId || !mainPort) {
      // Direct /__preview navigations without an inited bridge cannot recover.
      event.respondWith(lostConnectionPage());
      return;
    }
    const prefix = `/__preview/${activeSessionId}`;
    if (!url.pathname.startsWith(prefix)) {
      event.respondWith(
        previewResponse('Preview session mismatch.', {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }),
      );
      return;
    }
    const path = url.pathname.slice(prefix.length) || '/';
    event.respondWith(
      handleVirtualRequest(event.request, path).catch((error) =>
        previewResponse(`Preview bridge error: ${error.message}`, {
          status: 502,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }),
      ),
    );
    return;
  }

  // Built apps request absolute /dist/assets/* URLs. history.replaceState does not
  // update service worker client.url, so do not rely on client/referrer matching.
  if (
    activeSessionId &&
    mainPort &&
    (url.pathname === '/dist' || url.pathname.startsWith('/dist/'))
  ) {
    const path = `${url.pathname}${url.search}`;
    event.respondWith(
      handleVirtualRequest(event.request, path).catch((error) =>
        previewResponse(`Preview bridge error: ${error.message}`, {
          status: 502,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }),
      ),
    );
    return;
  }

  const prefix = `/__preview/${activeSessionId || ''}`;
  const referrer = event.request.referrer ? new URL(event.request.referrer) : null;
  const isPreviewResource = Boolean(activeSessionId && referrer?.pathname.startsWith(prefix));
  if (!isPreviewResource) return;
  const path = `${url.pathname}${url.search}`;
  event.respondWith(
    handleVirtualRequest(event.request, path).catch((error) =>
      previewResponse(`Preview bridge error: ${error.message}`, {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
    ),
  );
});
