'use client';

import { useEffect, useState } from 'react';
import {
  getPreviewConfigurationError,
  getPreviewOrigins,
  isValidPreviewHandshake,
} from '../Views/PreviewArea/previewOrigins';
import { PREVIEW_CONNECT, PREVIEW_PROTOCOL_VERSION } from '../Views/PreviewArea/previewProtocol';

// Bump this URL when the preview-routing protocol changes so browsers replace
// an older scoped worker instead of continuing to serve its stale routes.
const SW_URL = '/__preview_sw__.js?v=20';
const SESSION_WINDOW_NAME_PREFIX = 'zakamurai-preview-';
const CONNECT_TIMEOUT_MS = 15000;

function getSessionId() {
  const querySession = new URLSearchParams(window.location.search).get('session');
  if (querySession) return querySession;
  return window.name.startsWith(SESSION_WINDOW_NAME_PREFIX)
    ? window.name.slice(SESSION_WINDOW_NAME_PREFIX.length)
    : null;
}

function getPreviewEntryUrl(sessionId) {
  return `/__preview/${encodeURIComponent(sessionId)}/dist/index.html`;
}

async function waitForWorkerState(worker, state) {
  if (!worker || worker.state === state) return;
  await new Promise((resolve, reject) => {
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

async function ensureActiveWorker(registration) {
  const activateWorker = async (worker) => {
    if (!worker) return;
    if (worker.state === 'activated') return;
    if (worker.state === 'installing') {
      await waitForWorkerState(worker, 'installed');
    }
    if (worker.state === 'installed') {
      worker.postMessage({ type: 'SKIP_WAITING' });
    }
    if (worker.state !== 'activated') {
      await waitForWorkerState(worker, 'activated');
    }
  };

  await activateWorker(registration.installing);
  await activateWorker(registration.waiting);
  await navigator.serviceWorker.ready;
  if (!registration.active) throw new Error('Preview service worker did not activate.');
  return registration.active;
}

async function waitForPreviewWorkerControl(registration) {
  const controllingThisWorker = () =>
    Boolean(
      navigator.serviceWorker.controller &&
        registration.active &&
        navigator.serviceWorker.controller.scriptURL === registration.active.scriptURL,
    );
  if (controllingThisWorker()) return;
  registration.active?.postMessage({ type: 'claim' });
  await new Promise((resolve, reject) => {
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

async function waitForInitAck(sessionId) {
  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      reject(new Error('Preview service worker did not acknowledge init.'));
    }, 5000);
    const onMessage = (event) => {
      if (event.data?.type !== 'init-ok' || event.data?.sessionId !== sessionId) return;
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('message', onMessage);
      resolve();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
  });
}

function installPreviewDocument(entryUrl, html) {
  // Stay on the same controlled WindowClient. Nested iframe / about:srcdoc
  // clients are not controlled, so their /__preview fetches hit the proxy 503.
  window.stop();
  window.history.replaceState(null, '', entryUrl);
  document.open();
  document.write(html);
  document.close();
}

export default function PreviewHost() {
  const [error, setError] = useState(null);

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
    if (!sessionId) {
      setError('Missing preview session. Return to Zakamurai and build the project again.');
      return undefined;
    }

    let cancelled = false;
    const connectTimeout = window.setTimeout(() => {
      if (!cancelled) {
        setError('Preview must be opened from Zakamurai so it can access the in-memory build.');
      }
    }, CONNECT_TIMEOUT_MS);

    const connect = async (event) => {
      // COOP can make event.source identity checks fail across origins even when
      // the message truly came from the IDE. Origin + session + port are enough.
      const handshakeOk =
        isValidPreviewHandshake(event, {
          expectedOrigin: ideOrigin,
          expectedSource: peerWindow,
          sessionId,
          type: PREVIEW_CONNECT,
          version: PREVIEW_PROTOCOL_VERSION,
        }) ||
        (event.origin === ideOrigin &&
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
        const registration = await navigator.serviceWorker.register(SW_URL, {
          scope: '/',
        });
        await ensureActiveWorker(registration);
        await waitForPreviewWorkerControl(registration);
        const controlling =
          navigator.serviceWorker.controller &&
          registration.active &&
          navigator.serviceWorker.controller.scriptURL === registration.active.scriptURL
            ? navigator.serviceWorker.controller
            : registration.active;
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
    // Cross-origin external tabs often lose window.opener in production. The IDE
    // also initiates the handshake when it opens the tab; only ping when we can.
    peerWindow?.postMessage(
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
    <main style={{ color: '#e7ecef', background: '#101214', height: '100vh', padding: '2rem' }}>
      <p>{error || 'Connecting isolated preview…'}</p>
    </main>
  );
}
