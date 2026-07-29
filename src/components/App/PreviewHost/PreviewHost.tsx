'use client';

import type { PreviewConnectMessage } from '@/components/App/Views/PreviewArea/preview-types';
import { useEffect, useState } from 'react';
import {
  type PreviewHandshakeEvent,
  expandOriginAliases,
  getPreviewConfigurationError,
  getPreviewOrigins,
  getPreviewServiceWorkerScope,
  isValidPreviewHandshake,
  originMatches,
} from '../Views/PreviewArea/previewOrigins';
import {
  PREVIEW_CONNECT,
  PREVIEW_CONNECT_ACK,
  PREVIEW_PROTOCOL_VERSION,
} from '../Views/PreviewArea/previewProtocol';
import styles from './PreviewHost.module.css';

const SW_URL = '/__preview_sw__.js?v=25';
const SESSION_WINDOW_NAME_PREFIXES = ['zakamurai-preview-tab-', 'zakamurai-preview-'];
const CONNECT_TIMEOUT_MS = 15000;

function getSessionIdFromWindowName(name: string): string | null {
  for (const prefix of SESSION_WINDOW_NAME_PREFIXES) {
    if (name.startsWith(prefix)) return name.slice(prefix.length);
  }
  return null;
}

function getSessionId(): string | null {
  const querySession = new URLSearchParams(window.location.search).get('session');
  if (querySession) return querySession;
  return getSessionIdFromWindowName(window.name);
}

function postMessageToOriginAliases(
  target: Window | null | undefined,
  message: PreviewConnectMessage,
  preferredOrigin: string | null | undefined,
) {
  if (!target?.postMessage || !preferredOrigin) return;
  const origins = new Set([preferredOrigin, ...expandOriginAliases(preferredOrigin)]);
  for (const origin of origins) {
    try {
      target.postMessage(message, origin);
    } catch {
      // Cross-origin WindowProxy may reject some targets under COOP.
    }
  }
}

function getPreviewEntryUrl(sessionId: string): string {
  return `/__preview/${encodeURIComponent(sessionId)}/dist/index.html`;
}

async function waitForWorkerState(worker: ServiceWorker, state: ServiceWorkerState): Promise<void> {
  if (!worker || worker.state === state) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.removeEventListener('statechange', onStateChange);
      reject(new Error(`Preview service worker did not reach ${state}.`));
    }, 5000);
    const onStateChange = () => {
      if (worker.state !== state) return;
      window.clearTimeout(timeout);
      worker.removeEventListener('statechange', onStateChange);
      resolve();
    };
    worker.addEventListener('statechange', onStateChange);
  });
}

async function ensureActiveWorker(registration: ServiceWorkerRegistration): Promise<ServiceWorker> {
  const activateWorker = async (worker: ServiceWorker | null) => {
    if (!worker) return;
    if (worker.state === 'activated') return;
    if (worker.state === 'installing') {
      await waitForWorkerState(worker, 'installed');
    }
    if (worker.state === 'installed') {
      worker.postMessage({ type: 'SKIP_WAITING' });
    }
    if ((worker.state as ServiceWorkerState) !== 'activated') {
      await waitForWorkerState(worker, 'activated');
    }
  };

  await activateWorker(registration.installing);
  await activateWorker(registration.waiting);
  await navigator.serviceWorker.ready;
  if (!registration.active) throw new Error('Preview service worker did not activate.');
  return registration.active;
}

async function waitForPreviewWorkerControl(registration: ServiceWorkerRegistration): Promise<void> {
  const controllingThisWorker = () =>
    Boolean(
      navigator.serviceWorker.controller &&
        registration.active &&
        navigator.serviceWorker.controller.scriptURL === registration.active.scriptURL,
    );
  if (controllingThisWorker()) return;
  registration.active?.postMessage({ type: 'claim' });
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      reject(new Error('Preview service worker did not take control.'));
    }, 5000);
    const onControllerChange = () => {
      if (!controllingThisWorker()) return;
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      resolve();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    if (controllingThisWorker()) {
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      resolve();
    }
  });
}

async function waitForInitAck(sessionId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      reject(new Error('Preview service worker did not acknowledge init.'));
    }, 5000);
    const onMessage = (event: MessageEvent<{ type?: string; sessionId?: string }>) => {
      if (event.data?.type !== 'init-ok' || event.data?.sessionId !== sessionId) return;
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('message', onMessage);
      resolve();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
  });
}

function installPreviewDocument(entryUrl: string, html: string) {
  window.stop();
  window.history.replaceState(null, '', entryUrl);
  document.open();
  document.write(html);
  document.close();
}

export default function PreviewHost() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = getSessionId();
    const peerWindow = window.opener || (window.parent !== window ? window.parent : null);
    const origins = getPreviewOrigins({ windowOrigin: window.location.origin });
    const { ideOrigin } = origins;
    const configurationError = getPreviewConfigurationError(origins);
    if (configurationError) {
      setError(configurationError);
      return undefined;
    }
    if (!sessionId || !ideOrigin) {
      setError('Missing preview session. Return to Zakamurai and build the project again.');
      return undefined;
    }

    let cancelled = false;
    const connectTimeout = window.setTimeout(() => {
      if (!cancelled) {
        setError('Preview must be opened from Zakamurai so it can access the in-memory build.');
      }
    }, CONNECT_TIMEOUT_MS);

    const connect = async (event: MessageEvent<PreviewConnectMessage>) => {
      const handshakeOk =
        isValidPreviewHandshake(event as PreviewHandshakeEvent, {
          expectedOrigin: ideOrigin,
          expectedSource: peerWindow,
          sessionId,
          type: PREVIEW_CONNECT,
          version: PREVIEW_PROTOCOL_VERSION,
        }) ||
        (originMatches(event.origin, ideOrigin) &&
          event.data?.type === PREVIEW_CONNECT &&
          event.data?.version === PREVIEW_PROTOCOL_VERSION &&
          event.data?.sessionId === sessionId &&
          !!event.ports?.[0]);
      if (!handshakeOk || !event.ports[0]) {
        return;
      }
      window.clearTimeout(connectTimeout);
      window.removeEventListener('message', connect);
      try {
        const ack = {
          type: PREVIEW_CONNECT_ACK,
          version: PREVIEW_PROTOCOL_VERSION,
          sessionId,
          surface: window.parent !== window ? ('iframe' as const) : ('external' as const),
        };
        postMessageToOriginAliases(event.source as Window, ack, event.origin || ideOrigin);
        if (event.origin && ideOrigin && !originMatches(event.origin, ideOrigin)) {
          postMessageToOriginAliases(event.source as Window, ack, ideOrigin);
        }
      } catch {
        // Opener may be gone; the transferred port is what matters.
      }
      try {
        const swScope = getPreviewServiceWorkerScope(origins);
        const registration = await navigator.serviceWorker.register(SW_URL, {
          scope: swScope,
        });
        await ensureActiveWorker(registration);
        if (swScope !== '/') {
          await waitForPreviewWorkerControl(registration);
        }
        const controlling =
          navigator.serviceWorker.controller &&
          registration.active &&
          navigator.serviceWorker.controller.scriptURL === registration.active.scriptURL
            ? navigator.serviceWorker.controller
            : registration.active;
        if (!controlling) throw new Error('Preview service worker is not available.');
        const entryUrl = getPreviewEntryUrl(sessionId);
        const initAck = waitForInitAck(sessionId);
        controlling.postMessage({ type: 'init', sessionId, ideOrigin }, [event.ports[0]]);
        await initAck;
        const response = await fetch(entryUrl, { credentials: 'same-origin' });
        const html = await response.text();
        if (!response.ok) {
          throw new Error(
            html
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 240) || `Preview failed (${response.status})`,
          );
        }
        if (!cancelled) {
          installPreviewDocument(entryUrl, html);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };

    window.addEventListener('message', connect);
    postMessageToOriginAliases(
      peerWindow,
      { type: PREVIEW_CONNECT, version: PREVIEW_PROTOCOL_VERSION, sessionId },
      ideOrigin,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(connectTimeout);
      window.removeEventListener('message', connect);
    };
  }, []);

  return (
    <main className={styles.main}>
      <p>{error || 'Connecting isolated preview…'}</p>
    </main>
  );
}
