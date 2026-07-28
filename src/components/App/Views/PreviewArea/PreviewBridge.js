import { Compiler } from '@/utils/compiler';
import { useEffect, useRef } from 'react';
import {
  getPreviewOrigins,
  getPreviewServiceWorkerScope,
  isValidPreviewHandshake,
  originMatches,
} from './previewOrigins';
import {
  PREVIEW_CONNECT,
  PREVIEW_CONNECT_ACK,
  PREVIEW_PROTOCOL_VERSION,
  PREVIEW_RESPONSE,
  PREVIEW_STREAM_CHUNK,
  PREVIEW_STREAM_END,
  PREVIEW_STREAM_START,
  isPreviewRequest,
  toBase64,
} from './previewProtocol';

const STREAM_CHUNK_SIZE = 64 * 1024;
const EXTERNAL_HANDSHAKE_INTERVAL_MS = 400;
const EXTERNAL_HANDSHAKE_TIMEOUT_MS = 12000;
const WORKER_BRIDGE_MAINTENANCE_MS = 8000;
const WORKER_BRIDGE_KEY = Symbol('preview-worker-bridge');
const SURFACE_IFRAME = 'iframe';
const SURFACE_EXTERNAL = 'external';

function isPreviewConnectAck(event, { previewOrigin, sessionId }) {
  return Boolean(
    originMatches(event.origin, previewOrigin) &&
      event.data?.type === PREVIEW_CONNECT_ACK &&
      event.data?.version === PREVIEW_PROTOCOL_VERSION &&
      event.data?.sessionId === sessionId,
  );
}

function toResponsePayload(response) {
  const body =
    response?.body instanceof Uint8Array ? response.body : new Uint8Array(response?.body || []);
  return {
    statusCode: response?.statusCode || 500,
    statusMessage: response?.statusMessage || 'Internal Server Error',
    headers: response?.headers || { 'Content-Type': 'text/plain' },
    body,
  };
}

async function handleRequest(message) {
  const container = Compiler.getContainer();
  if (!container?.serverBridge)
    throw new Error('Preview server is not ready. Build the project again.');
  const body = message.bodyBase64
    ? Uint8Array.from(atob(message.bodyBase64), (char) => char.charCodeAt(0))
    : null;
  return toResponsePayload(
    await container.serverBridge.handleRequest(
      3000,
      message.method,
      message.path,
      message.headers || {},
      body,
    ),
  );
}

function bindPortHandler(port, { sessionId, onError, onFirstRequest }) {
  let sawRequest = false;
  port.onmessage = async ({ data: request }) => {
    if (!isPreviewRequest(request, sessionId)) return;
    if (!sawRequest) {
      sawRequest = true;
      onFirstRequest?.(port);
    }
    try {
      const response = await handleRequest(request);
      if (request.streaming) {
        port.postMessage({
          type: PREVIEW_STREAM_START,
          id: request.id,
          sessionId,
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          headers: response.headers,
        });
        for (let offset = 0; offset < response.body.length; offset += STREAM_CHUNK_SIZE) {
          port.postMessage({
            type: PREVIEW_STREAM_CHUNK,
            id: request.id,
            sessionId,
            chunkBase64: toBase64(response.body.subarray(offset, offset + STREAM_CHUNK_SIZE)),
          });
        }
        port.postMessage({ type: PREVIEW_STREAM_END, id: request.id, sessionId });
        return;
      }
      port.postMessage({
        type: PREVIEW_RESPONSE,
        id: request.id,
        sessionId,
        statusCode: response.statusCode,
        statusMessage: response.statusMessage,
        headers: response.headers,
        bodyBase64: toBase64(response.body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      port.postMessage({
        type: PREVIEW_RESPONSE,
        id: request.id,
        sessionId,
        error: message,
      });
      onError?.(message);
    }
  };
}

function attachBridgePort({ portsRef, source, port, sessionId, onError }) {
  const existing = portsRef.current.get(source);
  existing?.close();
  portsRef.current.set(source, port);
  bindPortHandler(port, { sessionId, onError });
}

function closeSurfacePorts(surfacePortsRef, portsRef, surface, keepPort = null) {
  const ports = surfacePortsRef.current.get(surface);
  if (!ports) return;
  for (const port of ports) {
    if (port === keepPort) continue;
    port.close();
    for (const [key, value] of portsRef.current.entries()) {
      if (value === port) portsRef.current.delete(key);
    }
  }
  if (keepPort) {
    surfacePortsRef.current.set(surface, new Set([keepPort]));
  } else {
    surfacePortsRef.current.delete(surface);
  }
}

function pushHandshake(
  target,
  { portsRef, surfacePortsRef, confirmedSurfacesRef, surface, sessionId, previewOrigin, onError },
) {
  // Retry until the preview host ACKs. The first postMessage often races the
  // host's React mount. Keep prior ports alive — PreviewHost may already be
  // using an earlier MessagePort when a later retry fires.
  if (!target || confirmedSurfacesRef.current.has(surface)) return;
  const channel = new MessageChannel();
  const port = channel.port1;
  const surfacePorts = surfacePortsRef.current.get(surface) || new Set();
  surfacePorts.add(port);
  surfacePortsRef.current.set(surface, surfacePorts);
  portsRef.current.set(port, port);
  bindPortHandler(port, {
    sessionId,
    onError,
    onFirstRequest: () => {
      confirmedSurfacesRef.current.add(surface);
      closeSurfacePorts(surfacePortsRef, portsRef, surface, port);
    },
  });
  try {
    target.postMessage(
      { type: PREVIEW_CONNECT, version: PREVIEW_PROTOCOL_VERSION, sessionId },
      previewOrigin,
      [channel.port2],
    );
  } catch {
    // Preview surface may not be ready yet.
  }
}

function resolveHandshakeSurface(event, { iframeWindow, externalWindow }) {
  const reported = event.data?.surface;
  if (reported === SURFACE_IFRAME || reported === SURFACE_EXTERNAL) return reported;
  if (iframeWindow && event.source === iframeWindow) return SURFACE_IFRAME;
  if (externalWindow && event.source === externalWindow) return SURFACE_EXTERNAL;
  // COOP can break WindowProxy identity. Prefer the external tab when one is open —
  // iframe handshakes still succeed via matching source when identity works.
  if (externalWindow) return SURFACE_EXTERNAL;
  if (iframeWindow) return SURFACE_IFRAME;
  return null;
}

async function attachWorkerBridge({ portsRef, sessionId, ideOrigin, previewScope, onError }) {
  if (!previewScope || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration(previewScope);
    const worker = registration?.active;
    if (!worker) return false;
    const channel = new MessageChannel();
    attachBridgePort({
      portsRef,
      source: WORKER_BRIDGE_KEY,
      port: channel.port1,
      sessionId,
      onError,
    });
    worker.postMessage({ type: 'init', sessionId, ideOrigin }, [channel.port2]);
    return true;
  } catch {
    return false;
  }
}

/** Bridges an isolated preview service worker to the local almostnode server. */
export default function PreviewBridge({
  iframeRef,
  externalPreviewRef,
  externalPreviewNonce = 0,
  iframeHandshakeNonce = 0,
  sessionId,
  previewOrigin,
  onError,
}) {
  const portsRef = useRef(new Map());
  const surfacePortsRef = useRef(new Map());
  const confirmedSurfacesRef = useRef(new Set());

  useEffect(() => {
    const onMessage = (event) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      const externalPreviewWindow = externalPreviewRef?.current;

      if (isPreviewConnectAck(event, { previewOrigin, sessionId })) {
        const surface = resolveHandshakeSurface(event, {
          iframeWindow,
          externalWindow: externalPreviewWindow,
        });
        if (surface) confirmedSurfacesRef.current.add(surface);
        return;
      }

      const isIframeSource = Boolean(iframeWindow && event.source === iframeWindow);
      const isExternalSource = Boolean(
        externalPreviewWindow && event.source === externalPreviewWindow,
      );
      const expectedSource = isExternalSource
        ? externalPreviewWindow
        : isIframeSource
          ? iframeWindow
          : null;

      const handshakeOk =
        isValidPreviewHandshake(event, {
          expectedOrigin: previewOrigin,
          expectedSource,
          sessionId,
          type: PREVIEW_CONNECT,
          version: PREVIEW_PROTOCOL_VERSION,
        }) ||
        (originMatches(event.origin, previewOrigin) &&
          event.data?.type === PREVIEW_CONNECT &&
          event.data?.version === PREVIEW_PROTOCOL_VERSION &&
          event.data?.sessionId === sessionId);

      if (!handshakeOk) return;
      const channel = new MessageChannel();
      const portSource = event.source || expectedSource;
      attachBridgePort({
        portsRef,
        source: portSource,
        port: channel.port1,
        sessionId,
        onError,
      });
      try {
        (event.source || expectedSource)?.postMessage(
          { type: PREVIEW_CONNECT, version: PREVIEW_PROTOCOL_VERSION, sessionId },
          previewOrigin,
          [channel.port2],
        );
      } catch {
        return;
      }
      // Stop proactive retries from replacing this live port.
      const surface = resolveHandshakeSurface(event, {
        iframeWindow,
        externalWindow: externalPreviewWindow,
      });
      if (surface) confirmedSurfacesRef.current.add(surface);
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      for (const port of portsRef.current.values()) port.close();
      portsRef.current.clear();
      surfacePortsRef.current.clear();
      confirmedSurfacesRef.current.clear();
    };
  }, [externalPreviewRef, iframeRef, onError, previewOrigin, sessionId]);

  useEffect(() => {
    const externalWindow = externalPreviewRef?.current;
    if (!externalWindow || !externalPreviewNonce) return undefined;

    confirmedSurfacesRef.current.delete(SURFACE_EXTERNAL);
    closeSurfacePorts(surfacePortsRef, portsRef, SURFACE_EXTERNAL);
    const push = () =>
      pushHandshake(externalWindow, {
        portsRef,
        surfacePortsRef,
        confirmedSurfacesRef,
        surface: SURFACE_EXTERNAL,
        sessionId,
        previewOrigin,
        onError,
      });
    push();
    const interval = window.setInterval(push, EXTERNAL_HANDSHAKE_INTERVAL_MS);
    const timeout = window.setTimeout(
      () => window.clearInterval(interval),
      EXTERNAL_HANDSHAKE_TIMEOUT_MS,
    );
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [externalPreviewNonce, externalPreviewRef, onError, previewOrigin, sessionId]);

  useEffect(() => {
    const iframeWindow = iframeRef.current?.contentWindow;
    if (!iframeWindow || !iframeHandshakeNonce) return undefined;

    confirmedSurfacesRef.current.delete(SURFACE_IFRAME);
    closeSurfacePorts(surfacePortsRef, portsRef, SURFACE_IFRAME);
    const push = () =>
      pushHandshake(iframeWindow, {
        portsRef,
        surfacePortsRef,
        confirmedSurfacesRef,
        surface: SURFACE_IFRAME,
        sessionId,
        previewOrigin,
        onError,
      });
    push();
    const interval = window.setInterval(push, EXTERNAL_HANDSHAKE_INTERVAL_MS);
    const timeout = window.setTimeout(
      () => window.clearInterval(interval),
      EXTERNAL_HANDSHAKE_TIMEOUT_MS,
    );
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [iframeHandshakeNonce, iframeRef, onError, previewOrigin, sessionId]);

  useEffect(() => {
    if (!sessionId || !previewOrigin) return undefined;
    const origins = getPreviewOrigins({
      windowOrigin: typeof window === 'undefined' ? '' : window.location.origin,
    });
    const canInitWorkerFromParent = origins.ideOrigin === origins.previewOrigin;
    if (!canInitWorkerFromParent) return undefined;

    const previewScope = getPreviewServiceWorkerScope(origins);
    const ideOrigin = origins.ideOrigin || window.location.origin;
    const maintain = () => {
      void attachWorkerBridge({ portsRef, sessionId, ideOrigin, previewScope, onError });
    };
    maintain();
    const interval = window.setInterval(maintain, WORKER_BRIDGE_MAINTENANCE_MS);
    return () => window.clearInterval(interval);
  }, [onError, previewOrigin, sessionId]);

  return null;
}
