/**
 * Container management for almostnode.
 */

let _sharedContainer = null;

/**
 * Returns the current shared container, or null if not yet initialised.
 */
export function getSharedContainer() {
  return _sharedContainer;
}

/**
 * Destroys the shared container and wipes the module-level reference.
 */
export async function resetContainer() {
  if (_sharedContainer) {
    try {
      if (typeof _sharedContainer.teardown === 'function') {
        _sharedContainer.teardown();
      } else if (typeof _sharedContainer.destroy === 'function') {
        _sharedContainer.destroy();
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
export async function initContainer(onLog, setupDevServer) {
  if (!_sharedContainer) {
    onLog('Starting almostnode container...');
    try {
      const nativeImport = new Function('specifier', 'return import(specifier)');
      const { createContainer } = await nativeImport('/lib/almostnode/index.mjs');

      _sharedContainer = await createContainer({
        onConsole: (level, ...args) => {
          onLog(`[${level.toUpperCase()}] ${args.join(' ')}`);
        },
      });

      if (setupDevServer) {
        await setupDevServer(_sharedContainer);
      }
    } catch (err) {
      onLog(`Failed to start container: ${err.message}`);
      throw err;
    }
  }
  return _sharedContainer;
}
