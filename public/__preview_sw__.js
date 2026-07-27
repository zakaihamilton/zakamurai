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

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
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

function injectBridge(bytes, headers) {
  const contentType = headers['Content-Type'] || headers['content-type'] || '';
  if (!contentType.includes('text/html')) return bytes;
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
  if (response.stream) {
    return new Response(response.stream, {
      status: response.statusCode,
      statusText: response.statusMessage,
      headers: responseHeaders,
    });
  }
  const bytes = injectBridge(base64ToBytes(response.bodyBase64), responseHeaders);
  responseHeaders.set('Content-Length', String(bytes.length));
  return new Response(bytes, {
    status: response.statusCode,
    statusText: response.statusMessage,
    headers: responseHeaders,
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/__preview/')) {
    if (!activeSessionId || !mainPort) {
      // In-memory bridge state is lost when the worker is restarted or replaced.
      // Bounce back to PreviewHost so the IDE can re-handshake and re-init.
      const match = url.pathname.match(/^\/__preview\/([^/]+)/);
      const sessionFromPath = match ? decodeURIComponent(match[1]) : null;
      if (sessionFromPath) {
        event.respondWith(
          previewResponse('', {
            status: 303,
            headers: {
              Location: `/preview-host?session=${encodeURIComponent(sessionFromPath)}`,
              'Content-Type': 'text/plain; charset=utf-8',
            },
          }),
        );
        return;
      }
      event.respondWith(
        previewResponse('Preview connection is not ready yet. Return to Zakamurai and rebuild.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }),
      );
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
