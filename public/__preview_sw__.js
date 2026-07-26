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

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
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
});

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
  const responseHeaders = new Headers(response.headers || {});
  responseHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
  responseHeaders.delete('X-Frame-Options');
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
  if (!activeSessionId) return;
  if (
    url.pathname === '/__preview_sw__.js' ||
    url.pathname === '/preview-error-bridge.js' ||
    url.pathname.startsWith('/_next/')
  )
    return;
  const path =
    event.request.mode === 'navigate' && url.pathname === '/'
      ? '/dist/index.html'
      : `${url.pathname}${url.search}`;
  event.respondWith(
    handleVirtualRequest(event.request, path).catch(
      (error) => new Response(`Preview bridge error: ${error.message}`, { status: 502 }),
    ),
  );
});
