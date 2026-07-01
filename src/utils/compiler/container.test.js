import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getSharedContainer, initContainer, resetContainer } from './container';

describe('container', () => {
  const originalFunction = global.Function;
  const originalNavigator = global.navigator;

  beforeEach(async () => {
    await resetContainer();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.Function = originalFunction;
    global.navigator = originalNavigator;
  });

  it('initializes and resets the container', async () => {
    const mockContainer = {
      teardown: vi.fn(),
      vfs: {
        reset: vi.fn(),
      },
    };

    const mockFunction = vi.fn().mockImplementation(() => {
      return async () => ({
        createContainer: async () => mockContainer,
      });
    });
    global.Function = mockFunction;

    const onLog = vi.fn();
    const setupDevServer = vi.fn();

    const container = await initContainer(onLog, setupDevServer);
    expect(container).toBe(mockContainer);
    expect(getSharedContainer()).toBe(mockContainer);
    expect(setupDevServer).toHaveBeenCalledWith(mockContainer);

    await resetContainer();
    expect(getSharedContainer()).toBeNull();
  });

  it('handles initialization failure', async () => {
    const mockFunction = vi.fn().mockImplementation(() => {
      return async () => {
        throw new Error('Import failed');
      };
    });
    global.Function = mockFunction;

    const onLog = vi.fn();
    await expect(initContainer(onLog)).rejects.toThrow('Import failed');
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('Failed to start container'));
  });

  it('unregisters service worker matching __sw__.js', async () => {
    const mockUnregister = vi.fn().mockResolvedValue(true);
    const mockRegistrations = [
      {
        active: { scriptURL: 'https://localhost/assets/__sw__.js' },
        unregister: mockUnregister,
      },
      {
        active: { scriptURL: 'https://localhost/assets/other.js' },
        unregister: vi.fn(),
      },
    ];

    Object.defineProperty(global, 'navigator', {
      writable: true,
      value: {
        serviceWorker: {
          getRegistrations: vi.fn().mockResolvedValue(mockRegistrations),
        },
      },
    });

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await resetContainer();

    expect(mockUnregister).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith('Service Worker unregistered.');
    consoleLogSpy.mockRestore();
  });

  it('handles service worker getRegistrations failure gracefully', async () => {
    Object.defineProperty(global, 'navigator', {
      writable: true,
      value: {
        serviceWorker: {
          getRegistrations: vi.fn().mockRejectedValue(new Error('SW Error')),
        },
      },
    });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await resetContainer();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Failed to unregister Service Worker:',
      expect.any(Error)
    );
    consoleWarnSpy.mockRestore();
  });
});
