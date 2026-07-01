import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock huggingface transformers
vi.mock('@huggingface/transformers', () => {
  return {
    env: { backends: { onnx: { wasm: {} } } },
    pipeline: vi.fn().mockResolvedValue(vi.fn().mockResolvedValue({
      data: [0.1, 0.2, 0.3]
    }))
  };
});

const listeners = {};
const mockSelf = {
  addEventListener: vi.fn((event, cb) => {
    listeners[event] = cb;
  }),
  postMessage: vi.fn(),
  storage: {
    getDirectory: vi.fn().mockResolvedValue({
      getFileHandle: vi.fn().mockResolvedValue({
        getFile: vi.fn().mockResolvedValue({
          text: vi.fn().mockResolvedValue(JSON.stringify([
            { filePath: 'existing.js', content: 'existing content', hash: 'abc', vector: [0.1, 0.2, 0.3] }
          ]))
        }),
        createWritable: vi.fn().mockResolvedValue({
          write: vi.fn().mockResolvedValue(),
          close: vi.fn().mockResolvedValue()
        })
      })
    })
  }
};

Object.defineProperty(globalThis, 'self', {
  value: mockSelf,
  writable: true,
  configurable: true
});

globalThis.navigator = {
  storage: mockSelf.storage
};

if (globalThis.crypto && globalThis.crypto.subtle) {
  vi.spyOn(globalThis.crypto.subtle, 'digest').mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
} else {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      subtle: {
        digest: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer)
      }
    },
    writable: true,
    configurable: true
  });
}

describe('rag-worker', () => {
  beforeAll(async () => {
    vi.resetModules();
    await import('./rag-worker');
  });

  beforeEach(() => {
    vi.clearAllMocks();
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
          content: 'console.log("hello world");\n\nconsole.log("second chunk");'
        }
      }
    });

    expect(mockSelf.postMessage).toHaveBeenCalledWith({
      id: 'msg-1',
      type: 'INDEX_FILE_SUCCESS'
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
          k: 2
        }
      }
    });

    expect(mockSelf.postMessage).toHaveBeenCalledWith({
      id: 'msg-2',
      type: 'SEARCH_SUCCESS',
      payload: expect.any(Array)
    });
  });

  it('handles errors and posts ERROR message', async () => {
    const onMessage = listeners.message;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Trigger error by sending invalid payload
    await onMessage({
      data: {
        id: 'msg-3',
        type: 'INDEX_FILE',
        payload: null
      }
    });

    expect(mockSelf.postMessage).toHaveBeenCalledWith({
      id: 'msg-3',
      type: 'ERROR',
      error: expect.any(String)
    });
    expect(consoleError).toHaveBeenCalledWith('[RAG] Worker error:', expect.any(TypeError));
  });
});
