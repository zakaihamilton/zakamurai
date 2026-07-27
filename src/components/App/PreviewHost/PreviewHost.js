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
const SW_URL = '/__preview_sw__.js?v=3';
const SESSION_WINDOW_NAME_PREFIX = 'zakamurai-preview-';

function getSessionId() {
  const querySession = new URLSearchParams(window.location.search).get('session');
  if (querySession) return querySession;
  return window.name.startsWith(SESSION_WINDOW_NAME_PREFIX)
    ? window.name.slice(SESSION_WINDOW_NAME_PREFIX.length)
    : null;
}

async function waitForPreviewWorkerControl() {
  if (navigator.serviceWorker.controller) return;
  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      reject(new Error('Preview service worker did not take control.'));
    }, 5000);
    const onControllerChange = () => {
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      resolve();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  });
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
    if (!peerWindow) {
      setError('Preview must be opened from Zakamurai so it can access the in-memory build.');
      return undefined;
    }
    let cancelled = false;
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
      window.removeEventListener('message', connect);
      try {
        // Root scope so this handshake document can become controlled before we
        // navigate into the session URL. Session isolation is enforced in the SW.
        const registration = await navigator.serviceWorker.register(SW_URL, {
          scope: '/',
        });
        await navigator.serviceWorker.ready;
        const worker = registration.active || registration.waiting || registration.installing;
        if (!worker) throw new Error('Preview service worker did not activate.');
        worker.postMessage({ type: 'init', sessionId, ideOrigin }, [event.ports[0]]);
        await waitForPreviewWorkerControl();
        if (!cancelled) {
          window.location.replace(`/__preview/${encodeURIComponent(sessionId)}/dist/index.html`);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };

    window.addEventListener('message', connect);
    peerWindow.postMessage(
      { type: PREVIEW_CONNECT, version: PREVIEW_PROTOCOL_VERSION, sessionId },
      ideOrigin,
    );
    return () => {
      cancelled = true;
      window.removeEventListener('message', connect);
    };
  }, []);

  return (
    <main style={{ color: '#e7ecef', background: '#101214', height: '100vh', padding: '2rem' }}>
      <p>{error || 'Connecting isolated preview…'}</p>
    </main>
  );
}
