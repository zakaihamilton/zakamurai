import '@testing-library/jest-dom';

if (
  typeof globalThis.localStorage === 'undefined' ||
  typeof globalThis.localStorage.getItem !== 'function'
) {
  const store = new Map<string, string>();

  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}
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
