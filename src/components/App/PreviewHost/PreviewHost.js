'use client';

import { useEffect, useState } from 'react';
import { PREVIEW_CONNECT, PREVIEW_PROTOCOL_VERSION } from '../Views/PreviewArea/previewProtocol';
import {
  getPreviewConfigurationError,
  getPreviewOrigins,
  isValidPreviewHandshake,
} from '../Views/PreviewArea/previewOrigins';

// Bump this URL when the preview-routing protocol changes so browsers replace
// an older scoped worker instead of continuing to serve its stale routes.
const SW_URL = '/__preview_sw__.js?v=2';
const SESSION_WINDOW_NAME_PREFIX = 'zakamurai-preview-';

function getSessionId() {
  const querySession = new URLSearchParams(window.location.search).get('session');
  if (querySession) return querySession;
  return window.name.startsWith(SESSION_WINDOW_NAME_PREFIX)
    ? window.name.slice(SESSION_WINDOW_NAME_PREFIX.length)
    : null;
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
      if (
        !isValidPreviewHandshake(event, {
          expectedOrigin: ideOrigin,
          expectedSource: peerWindow,
          sessionId,
          type: PREVIEW_CONNECT,
          version: PREVIEW_PROTOCOL_VERSION,
        }) ||
        !event.ports[0]
      ) {
        return;
      }
      window.removeEventListener('message', connect);
      try {
        const registration = await navigator.serviceWorker.register(SW_URL, {
          scope: '/',
        });
        await navigator.serviceWorker.ready;
        const worker = registration.active || registration.waiting || registration.installing;
        if (!worker) throw new Error('Preview service worker did not activate.');
        worker.postMessage({ type: 'init', sessionId, ideOrigin }, [event.ports[0]]);
        if (!cancelled) {
          window.location.replace('/');
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
