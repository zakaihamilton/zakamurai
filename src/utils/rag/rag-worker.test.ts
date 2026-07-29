import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockStorageManager } from '@/test-utils/domMocks';

const transformersMock = vi.hoisted(() => ({
  shouldFail: false,
  pipeline: vi.fn().mockResolvedValue(
    vi.fn().mockResolvedValue({
      data: [0.1, 0.2, 0.3],
    }),
  ),
}));

vi.mock('@huggingface/transformers', () => {
  return {
    get env() {
      if (transformersMock.shouldFail) {
        throw new Error('transformers load failed');
      }
      return { backends: { onnx: { wasm: {} } } };
    },
    pipeline: (...args: unknown[]) => transformersMock.pipeline(...args),
  };
});

const listeners: Record<string, (event: { data: Record<string, unknown> }) => Promise<void>> =
  {};

const mockSelf = {
  addEventListener: vi.fn((event: string, cb: (typeof listeners)[string]) => {
    listeners[event] = cb;
  }),
  postMessage: vi.fn(),
};

Object.defineProperty(globalThis, 'self', {
  value: mockSelf,
  writable: true,
  configurable: true,
});

globalThis.navigator = {
  ...globalThis.navigator,
  storage: mockStorageManager({
    getDirectory: vi.fn().mockResolvedValue({
      getFileHandle: vi.fn().mockResolvedValue({
        getFile: vi.fn().mockResolvedValue({
          text: vi.fn().mockResolvedValue(
            JSON.stringify([
              {
                filePath: 'existing.js',
                content: 'existing content',
                hash: 'abc',
                vector: [0.1, 0.2, 0.3],
              },
            ]),
          ),
        }),
        createWritable: vi.fn().mockResolvedValue({
          write: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    }),
  }),
} as Navigator;

if (globalThis.crypto?.subtle) {
  vi.spyOn(globalThis.crypto.subtle, 'digest').mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
} else {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      subtle: {
        digest: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
      },
    },
    writable: true,
    configurable: true,
  });
}

describe('rag-worker', () => {
  let testables: typeof import('./rag-worker').__testables;

  beforeAll(async () => {
    vi.resetModules();
    const mod = await import('./rag-worker');
    testables = mod.__testables;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    transformersMock.shouldFail = false;
  });

  it('registers a message listener', () => {
    expect(listeners.message).toBeTypeOf('function');
  });

  it('handles INDEX_FILE success', async () => {
    const onMessage = listeners.message;
    await onMessage({
      data: {
        id: 'msg-1',
        type: 'INDEX_FILE',
        payload: {
          filePath: 'src/App.js',
          content: 'console.log("hello world");\n\nconsole.log("second chunk");',
        },
      },
    });

    expect(mockSelf.postMessage).toHaveBeenCalledWith({
      id: 'msg-1',
      type: 'INDEX_FILE_SUCCESS',
    });
  });

  it('handles SEARCH success', async () => {
    const onMessage = listeners.message;
    await onMessage({
      data: {
        id: 'msg-2',
        type: 'SEARCH',
        payload: {
          query: 'hello',
          k: 2,
        },
      },
    });

    expect(mockSelf.postMessage).toHaveBeenCalledWith({
      id: 'msg-2',
      type: 'SEARCH_SUCCESS',
      payload: expect.any(Array),
    });
  });

  it('handles errors and posts ERROR message', async () => {
    const onMessage = listeners.message;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await onMessage({
      data: {
        id: 'msg-3',
        type: 'INDEX_FILE',
        payload: null,
      },
    });

    expect(mockSelf.postMessage).toHaveBeenCalledWith({
      id: 'msg-3',
      type: 'ERROR',
      error: expect.any(String),
    });
    expect(consoleError).toHaveBeenCalledWith('[RAG] Worker error:', expect.any(TypeError));
  });

  it('clears transformersPromise so a later retry can succeed', async () => {
    testables.resetTransformers();
    transformersMock.shouldFail = true;

    await expect(testables.loadTransformers()).rejects.toThrow('transformers load failed');

    transformersMock.shouldFail = false;
    await expect(testables.loadTransformers()).resolves.toMatchObject({
      pipeline: expect.any(Function),
    });
  });
});
