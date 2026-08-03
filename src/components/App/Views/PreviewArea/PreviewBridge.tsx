import { useEffect, useRef } from 'react';
import { bindPortHandler } from './PreviewBridgePort';
import type {
  PreviewBridgeProps,
  PreviewConnectMessage,
  PreviewSurfaceKind,
} from './preview-types';
import {
  type PreviewHandshakeEvent,
  getPreviewOrigins,
  getPreviewServiceWorkerScope,
  isValidPreviewHandshake,
} from './previewOrigins';
import { PREVIEW_CONNECT, PREVIEW_CONNECT_ACK, PREVIEW_PROTOCOL_VERSION } from './previewProtocol';

const EXTERNAL_HANDSHAKE_INTERVAL_MS = 400;
const EXTERNAL_HANDSHAKE_TIMEOUT_MS = 12000;
const WORKER_BRIDGE_MAINTENANCE_MS = 8000;
const WORKER_BRIDGE_KEY = Symbol('preview-worker-bridge');
const SURFACE_IFRAME = 'iframe' as const;
const SURFACE_EXTERNAL = 'external' as const;

type HandshakeContext = {
  portsRef: React.MutableRefObject<Map<unknown, MessagePort>>;
  surfacePortsRef: React.MutableRefObject<Map<PreviewSurfaceKind, Set<MessagePort>>>;
  confirmedSurfacesRef: React.MutableRefObject<Set<PreviewSurfaceKind>>;
  surface: PreviewSurfaceKind;
  sessionId: string;
  previewOrigin: string;
  onError?: (message: string) => void;
};

function attachBridgePort({
  portsRef,
  source,
  port,
  sessionId,
  onError,
}: {
  portsRef: React.MutableRefObject<Map<unknown, MessagePort>>;
  source: unknown;
  port: MessagePort;
  sessionId: string;
  onError?: (message: string) => void;
}) {
  const existing = portsRef.current.get(source);
  existing?.close();
  portsRef.current.set(source, port);
  bindPortHandler(port, { sessionId, onError });
}

function closeSurfacePorts(
  surfacePortsRef: React.MutableRefObject<Map<PreviewSurfaceKind, Set<MessagePort>>>,
  portsRef: React.MutableRefObject<Map<unknown, MessagePort>>,
  surface: PreviewSurfaceKind,
  keepPort: MessagePort | null = null,
) {
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
  target: Window | null | undefined,
  {
    portsRef,
    surfacePortsRef,
    confirmedSurfacesRef,
    surface,
    sessionId,
    previewOrigin,
    onError,
  }: HandshakeContext,
) {
  if (!target || confirmedSurfacesRef.current.has(surface)) return;
  const channel = new MessageChannel();
  const port = channel.port1;
  const surfacePorts = surfacePortsRef.current.get(surface) || new Set<MessagePort>();
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

function resolveHandshakeSurface(
  event: MessageEvent<PreviewConnectMessage>,
  {
    iframeWindow,
    externalWindow,
  }: { iframeWindow: Window | null | undefined; externalWindow: Window | null | undefined },
): PreviewSurfaceKind | null {
  if (iframeWindow && event.source === iframeWindow) return SURFACE_IFRAME;
  if (externalWindow && event.source === externalWindow) return SURFACE_EXTERNAL;
  return null;
}

async function attachWorkerBridge({
  portsRef,
  sessionId,
  ideOrigin,
  previewScope,
  onError,
}: {
  portsRef: React.MutableRefObject<Map<unknown, MessagePort>>;
  sessionId: string;
  ideOrigin: string;
  previewScope: string;
  onError?: (message: string) => void;
}): Promise<boolean> {
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
}: PreviewBridgeProps) {
  const portsRef = useRef(new Map<unknown, MessagePort>());
  const surfacePortsRef = useRef(new Map<PreviewSurfaceKind, Set<MessagePort>>());
  const confirmedSurfacesRef = useRef(new Set<PreviewSurfaceKind>());

  useEffect(() => {
    const onMessage = (event: MessageEvent<PreviewConnectMessage>) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      const externalPreviewWindow = externalPreviewRef?.current;
      const surface = resolveHandshakeSurface(event, {
        iframeWindow,
        externalWindow: externalPreviewWindow,
      });
      const expectedSource =
        surface === SURFACE_IFRAME
          ? iframeWindow
          : surface === SURFACE_EXTERNAL
            ? externalPreviewWindow
            : null;

      if (
        surface &&
        isValidPreviewHandshake(event as PreviewHandshakeEvent, {
          expectedOrigin: previewOrigin,
          expectedSource: (expectedSource ?? null) as MessageEventSource | null,
          sessionId,
          type: PREVIEW_CONNECT_ACK,
          version: PREVIEW_PROTOCOL_VERSION,
        })
      ) {
        confirmedSurfacesRef.current.add(surface);
        return;
      }

      if (
        !surface ||
        !isValidPreviewHandshake(event as PreviewHandshakeEvent, {
          expectedOrigin: previewOrigin,
          expectedSource: (expectedSource ?? null) as MessageEventSource | null,
          sessionId,
          type: PREVIEW_CONNECT,
          version: PREVIEW_PROTOCOL_VERSION,
        })
      ) {
        return;
      }
      const channel = new MessageChannel();
      attachBridgePort({
        portsRef,
        source: event.source,
        port: channel.port1,
        sessionId,
        onError,
      });
      try {
        const target = event.source as Window;
        target.postMessage(
          { type: PREVIEW_CONNECT, version: PREVIEW_PROTOCOL_VERSION, sessionId },
          previewOrigin,
          [channel.port2],
        );
      } catch {
        return;
      }
      confirmedSurfacesRef.current.add(surface);
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
