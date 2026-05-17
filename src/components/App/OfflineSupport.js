import { useEffect } from 'react';

const SERVICE_WORKER_URL = '/__sw__.js';

export function useOfflineSupport() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    let isMounted = true;

    async function registerServiceWorker() {
      try {
        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
          scope: '/',
          updateViaCache: 'none',
        });

        if (isMounted) {
          registration.update();
        }
      } catch (error) {
        console.warn('Offline support could not be enabled:', error);
      }
    }

    registerServiceWorker();

    return () => {
      isMounted = false;
    };
  }, []);
}
