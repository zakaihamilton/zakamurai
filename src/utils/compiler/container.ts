import {
  reportPreviewError,
  shouldReportPreviewError,
} from '@/components/App/Views/PreviewArea/previewErrorBridge';
import type { AlmostnodeContainer, OnLog } from './types';

let _sharedContainer: AlmostnodeContainer | null = null;
let _initPromise: Promise<AlmostnodeContainer> | null = null;

/**
 * Returns the current shared container, or null if not yet initialised.
 */
export function getSharedContainer(): AlmostnodeContainer | null {
  return _sharedContainer;
}

/**
 * Destroys the shared container and wipes the module-level reference.
 */
export async function resetContainer(): Promise<void> {
  _initPromise = null;
  if (_sharedContainer) {
    try {
      if (typeof _sharedContainer.teardown === 'function') {
        await _sharedContainer.teardown();
      } else if (typeof _sharedContainer.destroy === 'function') {
        await _sharedContainer.destroy();
      } else {
        _sharedContainer.vfs?.reset?.();
      }
    } catch (_) {
      /* ignore */
    }
    _sharedContainer = null;
  }

  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        if (registration.active?.scriptURL.includes('__sw__.js')) {
          await registration.unregister();
          console.log('Service Worker unregistered.');
        }
      }
    } catch (err) {
      console.warn('Failed to unregister Service Worker:', err);
    }
  }

  console.log('Compiler state and Service Worker completely cleared.');
}

/**
 * Initializes the almostnode container.
 */
export async function initContainer(
  onLog: OnLog,
  setupDevServer?: (container: AlmostnodeContainer) => Promise<void>,
): Promise<AlmostnodeContainer> {
  if (_sharedContainer) return _sharedContainer;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    onLog('Starting almostnode container...');
    try {
      const nativeImport = new Function('specifier', 'return import(specifier)') as (
        specifier: string,
      ) => Promise<{
        createContainer: (options: Record<string, unknown>) => Promise<AlmostnodeContainer>;
      }>;
      const { createContainer } = await nativeImport('/lib/almostnode/index.mjs');

      const container = await createContainer({
        onConsole: (level: string, ...args: unknown[]) => {
          const msg = args.join(' ');
          onLog(`[${level.toUpperCase()}] ${msg}`);
          if (shouldReportPreviewError(level, msg)) {
            reportPreviewError(msg);
          }
        },
      });

      if (setupDevServer) {
        await setupDevServer(container);
      }

      _sharedContainer = container;
      return container;
    } catch (err) {
      _initPromise = null;
      const message = err instanceof Error ? err.message : String(err);
      onLog(`Failed to start container: ${message}`);
      throw err;
    }
  })();

  return _initPromise;
}
