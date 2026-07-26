'use client';

import { useEffect, useState } from 'react';
import { PREVIEW_CONNECT, PREVIEW_PROTOCOL_VERSION } from '../Views/PreviewArea/previewProtocol';
import { getPreviewOrigins } from '../Views/PreviewArea/previewOrigins';

const SW_URL = '/__preview_sw__.js';

export default function PreviewHost() {
  const [error, setError] = useState(null);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('session');
    const { ideOrigin } = getPreviewOrigins({ windowOrigin: window.location.origin });
    if (!sessionId) {
      setError('Missing preview session. Return to Zakamurai and build the project again.');
      return undefined;
    }

    let cancelled = false;
    const connect = async (event) => {
      if (event.origin !== ideOrigin || event.source !== window.parent) return;
      const message = event.data;
      if (
        !message ||
        message.type !== PREVIEW_CONNECT ||
        message.version !== PREVIEW_PROTOCOL_VERSION ||
        message.sessionId !== sessionId ||
        !event.ports[0]
      ) {
        return;
      }
      window.removeEventListener('message', connect);
      try {
        const registration = await navigator.serviceWorker.register(SW_URL, {
          scope: '/__preview/',
        });
        await navigator.serviceWorker.ready;
        const worker = registration.active || registration.waiting || registration.installing;
        if (!worker) throw new Error('Preview service worker did not activate.');
        worker.postMessage({ type: 'init', sessionId, ideOrigin }, [event.ports[0]]);
        if (!cancelled) {
          window.location.replace(`/__preview/${encodeURIComponent(sessionId)}/dist/index.html`);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };

    window.addEventListener('message', connect);
    window.parent.postMessage(
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
