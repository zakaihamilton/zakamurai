import '@testing-library/jest-dom/vitest';

const localStorageEntries = new Map<string, string>();

// Node 25 exposes a warning-producing localStorage getter unless a backing
// file is configured. Replace it without reading the getter so tests use a
// deterministic, browser-shaped store on every supported Node version.
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => localStorageEntries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      localStorageEntries.set(key, String(value));
    },
    removeItem: (key: string) => {
      localStorageEntries.delete(key);
    },
    clear: () => {
      localStorageEntries.clear();
    },
    get length() {
      return localStorageEntries.size;
    },
    key: (index: number) => [...localStorageEntries.keys()][index] ?? null,
  } satisfies Storage,
});
// Mock Worker
if (typeof globalThis.Worker === 'undefined') {
  class MockWorker extends EventTarget {
    postMessage(): void {}
    terminate(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
  }
  globalThis.Worker = MockWorker as unknown as typeof Worker;
}

// Mock window.matchMedia (not implemented in jsdom 31)
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Mock navigator.storage
if (typeof globalThis.navigator.storage === 'undefined') {
  Object.defineProperty(globalThis.navigator, 'storage', {
    configurable: true,
    value: {
      getDirectory: async () => ({
        getDirectoryHandle: async () => ({}),
        getFileHandle: async () => ({
          getFile: async () => ({
            text: async () => '',
          }),
        }),
      }),
    },
  });
}
