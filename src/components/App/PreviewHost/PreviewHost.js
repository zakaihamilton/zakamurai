'use client';

import { useEffect, useState } from 'react';
import {
  PREVIEW_CONNECT,
  PREVIEW_PROTOCOL_VERSION,
  PREVIEW_READY,
} from '../Views/PreviewArea/previewProtocol';
import {
  getPreviewConfigurationError,
  getPreviewOrigins,
  isValidPreviewHandshake,
} from '../Views/PreviewArea/previewOrigins';

const SW_URL = '/__preview_sw__.js';

export default function PreviewHost() {
  const [error, setError] = useState(null);

  useEffect(() => {
    const origins = getPreviewOrigins({ windowOrigin: window.location.origin });
    const { ideOrigin } = origins;
    const configurationError = getPreviewConfigurationError(origins);
    if (configurationError) {
      setError(configurationError);
      return undefined;
    }
    let cancelled = false;
    const connect = async (event) => {
      if (
        !isValidPreviewHandshake(event, {
          expectedOrigin: ideOrigin,
          expectedSource: window.parent,
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
    window.parent.postMessage(
      { type: PREVIEW_READY, version: PREVIEW_PROTOCOL_VERSION },
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
