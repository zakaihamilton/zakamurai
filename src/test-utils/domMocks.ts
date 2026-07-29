export type MockProxyRequest = {
  nextUrl: {
    pathname: string;
    searchParams: URLSearchParams;
    clone: () => URL;
  };
  headers: {
    get: (key: string) => string | null;
  };
};

export function createMockProxyRequest(
  urlStr: string,
  headersObj: Record<string, string> = {},
): MockProxyRequest {
  const url = new URL(urlStr);
  const headers = new Map(Object.entries(headersObj));
  return {
    nextUrl: {
      pathname: url.pathname,
      searchParams: url.searchParams,
      clone: () => new URL(urlStr),
    },
    headers: {
      get: (key: string) => headers.get(key.toLowerCase()) || headers.get(key) || null,
    },
  };
}

export function mockStorageManager(
  overrides: Partial<StorageManager> = {},
): StorageManager {
  return {
    estimate: async () => ({ usage: 0, quota: 0 }),
    persist: async () => true,
    persisted: async () => false,
    getDirectory: async () => ({
      getDirectoryHandle: async () => ({} as FileSystemDirectoryHandle),
      getFileHandle: async () =>
        ({
          getFile: async () => ({ text: async () => '' }),
        }) as FileSystemFileHandle,
    }),
    ...overrides,
  } as StorageManager;
}

export function mockTouchEvent(
  partial: {
    touches?: Array<{ clientX: number; clientY: number }>;
    preventDefault?: () => void;
  } = {},
): React.TouchEvent {
  return {
    touches: partial.touches ?? [{ clientX: 0, clientY: 0 }],
    preventDefault: partial.preventDefault ?? (() => {}),
  } as unknown as React.TouchEvent;
}

export function makeKeyboardEvent(
  partial: {
    key?: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  } = {},
): KeyboardEvent {
  return {
    key: partial.key ?? '',
    metaKey: partial.metaKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    shiftKey: partial.shiftKey ?? false,
    altKey: partial.altKey ?? false,
  } as KeyboardEvent;
}

export function mockDragEvent(
  partial: {
    preventDefault?: () => void;
    stopPropagation?: () => void;
    dataTransfer?: Partial<DataTransfer>;
  } = {},
): React.DragEvent {
  return {
    preventDefault: partial.preventDefault ?? (() => {}),
    stopPropagation: partial.stopPropagation ?? (() => {}),
    dataTransfer: {
      effectAllowed: 'all',
      dropEffect: 'none',
      setData: () => {},
      getData: () => '',
      ...partial.dataTransfer,
    },
  } as unknown as React.DragEvent;
}

export function mockServiceWorker(register: (...args: unknown[]) => Promise<unknown>): void {
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: { register },
  });
}
