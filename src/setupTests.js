import '@testing-library/jest-dom';

if (
  typeof globalThis.localStorage === 'undefined' ||
  typeof globalThis.localStorage.getItem !== 'function'
) {
  const store = new Map();

  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}
// Mock Worker
if (typeof globalThis.Worker === 'undefined') {
  globalThis.Worker = class {
    postMessage() {}
    terminate() {}
    addEventListener() {}
    removeEventListener() {}
  };
}

// Mock navigator.storage
if (typeof globalThis.navigator.storage === 'undefined') {
  globalThis.navigator.storage = {
    getDirectory: async () => ({
      getDirectoryHandle: async () => ({}),
      getFileHandle: async () => ({
        getFile: async () => ({
          text: async () => '',
        }),
      }),
    }),
  };
}
