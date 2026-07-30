const pending = new Map();
/** @type {Map<string, { ports: MessagePort[], ideOrigin: string }>} */
const bridges = new Map();
let nextId = 0;
// Keep in sync with PREVIEW_HOST_PATH in previewOrigins.js
const PREVIEW_BOOTSTRAP_PATH = '/__preview/host';

function isPreviewBootstrapPath(pathname) {
  return pathname === PREVIEW_BOOTSTRAP_PATH || pathname.startsWith(`${PREVIEW_BOOTSTRAP_PATH}/`);
}

const bytesToBase64 = (bytes) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};
const base64ToBytes = (value) => Uint8Array.from(atob(value || ''), (char) => char.charCodeAt(0));

function getBridge(sessionId) {
  return sessionId ? bridges.get(sessionId) : null;
}

function pickPort(bridge) {
  return bridge?.ports?.length ? bridge.ports[bridge.ports.length - 1] : null;
}

function rememberPort(sessionId, port, ideOrigin) {
  let bridge = bridges.get(sessionId);
  if (!bridge) {
    bridge = { ports: [], ideOrigin };
    bridges.set(sessionId, bridge);
  }
  bridge.ideOrigin = ideOrigin;
  // Keep prior ports alive so an iframe re-handshake does not kill an open
  // external preview tab that still holds an older MessagePort for this session.
  if (!bridge.ports.includes(port)) {
    bridge.ports.push(port);
    // Bound growth from reconnect storms.
    if (bridge.ports.length > 4) {
      const removed = bridge.ports.shift();
      try {
        removed.close();
      } catch (_e) {
        /* ignore */
      }
    }
  }
  return bridge;
}

function bindPortMessages(port, sessionId) {
  port.onmessage = ({ data }) => {
    const pendingRequest = pending.get(data?.id);
    if (!pendingRequest || data.sessionId !== sessionId) return;
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
}

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

  const sessionId = event.data.sessionId;
  const port = event.ports[0];
  rememberPort(sessionId, port, event.data.ideOrigin);
  bindPortMessages(port, sessionId);

  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const client = event.source;
      if (client) {
        client.postMessage({ type: 'init-ok', sessionId });
      } else {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const windowClient of windows) {
          windowClient.postMessage({ type: 'init-ok', sessionId });
        }
      }
    })(),
  );
});

function expandOriginAliases(origin) {
  if (!origin) return [];
  try {
    const url = new URL(origin);
    const aliases = new Set([url.origin]);
    const portSuffix = url.port ? `:${url.port}` : '';
    if (url.hostname.startsWith('www.')) {
      aliases.add(`${url.protocol}//${url.hostname.slice(4)}${portSuffix}`);
    } else if (!url.hostname.includes('localhost') && url.hostname.includes('.')) {
      aliases.add(`${url.protocol}//www.${url.hostname}${portSuffix}`);
    }
    return [...aliases];
  } catch {
    return [origin];
  }
}

function applyPreviewEmbedHeaders(headers, ideOrigin) {
  // Parent IDE uses COEP require-corp. Cross-origin iframe documents must send
  // their own COEP header or Chrome blocks with coep-frame-resource-needs-coep-header.
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  const ancestors = new Set(["'self'", 'http://localhost:3000']);
  for (const origin of expandOriginAliases(ideOrigin)) ancestors.add(origin);
  headers.set('Content-Security-Policy', `frame-ancestors ${[...ancestors].join(' ')}`);
  headers.delete('X-Frame-Options');
  return headers;
}

function previewResponse(body, init = {}, ideOrigin = null) {
  const headers = applyPreviewEmbedHeaders(new Headers(init.headers || {}), ideOrigin);
  return new Response(body, { ...init, headers });
}

async function requestFromIde(sessionId, request) {
  const bridge = getBridge(sessionId);
  const port = pickPort(bridge);
  if (!bridge || !port) throw new Error('Isolated preview connection is not ready');
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
    try {
      port.postMessage({ ...request, type: 'preview-request', id, sessionId });
    } catch (_error) {
      // Drop a dead port and retry once with an older port for this session.
      bridge.ports = bridge.ports.filter((candidate) => candidate !== port);
      const fallback = pickPort(bridge);
      if (!fallback) {
        pending.delete(id);
        clearTimeout(timeout);
        reject(new Error('Isolated preview connection is not ready'));
        return;
      }
      try {
        fallback.postMessage({ ...request, type: 'preview-request', id, sessionId });
      } catch (retryError) {
        pending.delete(id);
        clearTimeout(timeout);
        reject(retryError instanceof Error ? retryError : new Error(String(retryError)));
      }
    }
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

function injectBridge(bytes, headers, path, ideOrigin) {
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

async function handleVirtualRequest(sessionId, request, path) {
  const bridge = getBridge(sessionId);
  const headers = Object.fromEntries(request.headers.entries());
  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? null
      : bytesToBase64(new Uint8Array(await request.arrayBuffer()));
  const response = await requestFromIde(sessionId, {
    method: request.method,
    path,
    headers,
    bodyBase64: body,
    streaming: request.method === 'POST' && path.startsWith('/api/'),
  });
  const responseHeaders = applyPreviewEmbedHeaders(
    new Headers(response.headers || {}),
    bridge?.ideOrigin,
  );
  const forcedType = contentTypeForPath(path);
  if (forcedType) responseHeaders.set('Content-Type', forcedType);
  if (response.stream) {
    return new Response(response.stream, {
      status: response.statusCode,
      statusText: response.statusMessage,
      headers: responseHeaders,
    });
  }
  const bytes = injectBridge(
    base64ToBytes(response.bodyBase64),
    responseHeaders,
    path,
    bridge?.ideOrigin,
  );
  responseHeaders.set('Content-Length', String(bytes.length));
  return new Response(bytes, {
    status: response.statusCode,
    statusText: response.statusMessage,
    headers: responseHeaders,
  });
}

function lostConnectionPage(sessionId = null) {
  // Top-level external tabs cannot talk to the IDE via parent.postMessage.
  // Send them through the explicit preview handshake route. Using / would
  // reload the IDE itself when local previews share the IDE origin.
  const reconnectToHandshake =
    sessionId &&
    `<script>(function(){try{if(window.parent!==window)return;location.replace('/__preview/host?session='+encodeURIComponent(${JSON.stringify(sessionId)})+'&zakamurai-surface=preview');}catch(_e){}})();</script>`;
  const reconnectScript = `<script>(function(){try{var m=location.pathname.match(/^\\/(__preview\\/)([^/]+)/);var sessionId=m&&m[2];if(!sessionId||window.parent===window)return;window.parent.postMessage({source:'zakamurai-preview',type:'reconnect',sessionId:decodeURIComponent(sessionId),message:'Preview connection was lost.'},'*');}catch(_e){}})();</script>`;
  return previewResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Preview</title>
<style>html,body{margin:0;height:100%;background:#101214;color:#e7ecef;font:14px/1.4 system-ui,sans-serif}
main{padding:2rem}</style>${reconnectScript}${reconnectToHandshake || ''}</head>
<body><main><p>Preview connection was lost. Return to Zakamurai and click Build, then open Preview again.</p></main></body></html>`,
    {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}

function sessionIdFromPreviewPath(pathname) {
  const match = pathname.match(/^\/__preview\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bootstrap handshake page must reach Next.js PreviewHost, not the virtual server.
  if (isPreviewBootstrapPath(url.pathname)) {
    return;
  }

  if (url.pathname.startsWith('/__preview/')) {
    const sessionId = sessionIdFromPreviewPath(url.pathname);
    const bridge = getBridge(sessionId);
    if (!sessionId || !bridge || !pickPort(bridge)) {
      event.respondWith(lostConnectionPage(sessionId));
      return;
    }
    const prefix = `/__preview/${sessionId}`;
    const path = url.pathname.slice(prefix.length) || '/';
    event.respondWith(
      handleVirtualRequest(sessionId, event.request, path).catch((error) =>
        previewResponse(
          `Preview bridge error: ${error.message}`,
          {
            status: 502,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          },
          bridge.ideOrigin,
        ),
      ),
    );
    return;
  }

  // Built apps request absolute /dist/assets/* URLs. history.replaceState does not
  // update service worker client.url, so do not rely on client/referrer matching.
  if (url.pathname === '/dist' || url.pathname.startsWith('/dist/')) {
    // Prefer the session from the document referrer / client URL when present.
    const referrer = event.request.referrer ? new URL(event.request.referrer) : null;
    const sessionId = sessionIdFromPreviewPath(referrer?.pathname || '');
    const bridge = getBridge(sessionId) || [...bridges.values()].at(-1);
    const resolvedSessionId =
      sessionId || [...bridges.keys()].find((id) => bridges.get(id) === bridge);
    if (!bridge || !resolvedSessionId || !pickPort(bridge)) return;
    const path = `${url.pathname}${url.search}`;
    event.respondWith(
      handleVirtualRequest(resolvedSessionId, event.request, path).catch((error) =>
        previewResponse(
          `Preview bridge error: ${error.message}`,
          {
            status: 502,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          },
          bridge.ideOrigin,
        ),
      ),
    );
    return;
  }

  const referrer = event.request.referrer ? new URL(event.request.referrer) : null;
  const sessionId = sessionIdFromPreviewPath(referrer?.pathname || '');
  const bridge = getBridge(sessionId);
  if (!bridge || !sessionId) return;
  const path = `${url.pathname}${url.search}`;
  event.respondWith(
    handleVirtualRequest(sessionId, event.request, path).catch((error) =>
      previewResponse(
        `Preview bridge error: ${error.message}`,
        {
          status: 502,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        },
        bridge.ideOrigin,
      ),
    ),
  );
});
