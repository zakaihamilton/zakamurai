import { mockStorageManager } from '@/test-utils/domMocks';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const transformersMock = vi.hoisted(() => {
  const extractor = Object.assign(
    vi.fn().mockResolvedValue({
      data: [0.1, 0.2, 0.3],
    }),
    { dispose: vi.fn().mockResolvedValue(undefined) },
  );
  const mock = {
    shouldFail: false,
    webGPUShouldFail: false,
    extractor,
    pipeline: vi.fn(),
  };
  mock.pipeline.mockImplementation(async (...args: unknown[]) => {
    const options = args[2] as { device?: string } | undefined;
    if (mock.webGPUShouldFail && options?.device === 'webgpu') {
      throw new Error('WebGPU unavailable');
    }
    return extractor;
  });
  return mock;
});

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

const listeners: Record<string, (event: { data: Record<string, unknown> }) => Promise<void>> = {};

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

  beforeEach(async () => {
    await testables.resetRuntime();
    vi.clearAllMocks();
    transformersMock.extractor.mockResolvedValue({
      data: [0.1, 0.2, 0.3],
    });
    transformersMock.shouldFail = false;
    transformersMock.webGPUShouldFail = false;
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

  it('uses WASM while WebLLM owns WebGPU and disposes the extractor', async () => {
    const onMessage = listeners.message;
    await onMessage({
      data: {
        id: 'msg-wasm',
        type: 'SEARCH',
        payload: {
          query: 'hello',
          k: 2,
          device: 'wasm',
        },
      },
    });
    expect(transformersMock.pipeline).toHaveBeenCalledWith(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { device: 'wasm' },
    );

    await onMessage({
      data: {
        id: 'msg-unload',
        type: 'UNLOAD_MODEL',
        payload: {},
      },
    });
    expect(transformersMock.extractor.dispose).toHaveBeenCalled();
    expect(mockSelf.postMessage).toHaveBeenCalledWith({
      id: 'msg-unload',
      type: 'UNLOAD_MODEL_SUCCESS',
    });
  });

  it('keeps WebGPU fallback sticky for the worker lifetime', async () => {
    const onMessage = listeners.message;
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    transformersMock.webGPUShouldFail = true;

    await onMessage({
      data: {
        id: 'msg-fallback-1',
        type: 'INDEX_FILE',
        payload: {
          filePath: 'src/first.js',
          content: 'const firstValue = "long enough to index";',
          device: 'webgpu',
        },
      },
    });
    await onMessage({
      data: {
        id: 'msg-fallback-2',
        type: 'INDEX_FILE',
        payload: {
          filePath: 'src/second.js',
          content: 'const secondValue = "also long enough";',
          device: 'webgpu',
        },
      },
    });

    expect(transformersMock.pipeline).toHaveBeenCalledTimes(2);
    expect(transformersMock.pipeline).toHaveBeenNthCalledWith(
      1,
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { device: 'webgpu', dtype: 'fp16' },
    );
    expect(transformersMock.pipeline).toHaveBeenNthCalledWith(
      2,
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { device: 'wasm' },
    );
    consoleWarn.mockRestore();
  });

  it('reconciles workspace snapshots and keeps identical chunks scoped to their files', async () => {
    transformersMock.extractor.mockImplementation(async (text: string) => ({
      data: text.toLowerCase().includes('alpha')
        ? [1, 0, 0]
        : text.toLowerCase().includes('beta')
          ? [0, 1, 0]
          : [0, 0, 1],
    }));
    const onMessage = listeners.message;
    const sync = async (id: string, files: Record<string, string>) =>
      onMessage({ data: { id, type: 'SYNC_WORKSPACE', payload: { files } } });
    const search = async (id: string, query: string) => {
      mockSelf.postMessage.mockClear();
      await onMessage({ data: { id, type: 'SEARCH', payload: { query, k: 5 } } });
      return mockSelf.postMessage.mock.calls[0][0] as {
        payload: Array<{ filePath: string }>;
      };
    };

    await sync('sync-initial', {
      'src/alpha.ts': 'alpha implementation with enough text',
      'src/beta.ts': 'beta implementation with enough text',
    });
    const alphaBefore = await search('search-alpha-before', 'alpha');
    expect(alphaBefore.payload.map(({ filePath }) => filePath)).toEqual(['src/alpha.ts']);

    await sync('sync-updated', {
      'src/beta.ts': 'beta implementation with enough text',
      'src/copy-a.ts': 'shared implementation with enough text',
      'src/copy-b.ts': 'shared implementation with enough text',
    });
    const alphaAfter = await search('search-alpha-after', 'alpha');
    const shared = await search('search-shared', 'shared');

    expect(alphaAfter.payload).toEqual([]);
    expect(shared.payload.map(({ filePath }) => filePath)).toEqual([
      'src/copy-a.ts',
      'src/copy-b.ts',
    ]);
  });

  it('reports only files that fit in the workspace index', async () => {
    const files = Object.fromEntries(
      Array.from({ length: 1501 }, (_, index) => [
        `src/file-${String(index).padStart(4, '0')}.ts`,
        `export const value${index} = "long enough chunk content";`,
      ]),
    );

    await listeners.message({
      data: { id: 'sync-at-capacity', type: 'SYNC_WORKSPACE', payload: { files } },
    });

    expect(mockSelf.postMessage).toHaveBeenCalledWith({
      id: 'sync-at-capacity',
      type: 'SYNC_WORKSPACE_SUCCESS',
      payload: {
        indexedFileCount: 1500,
        indexedChunkCount: 1500,
        skippedFileCount: 0,
        skippedChunkCount: 1,
      },
    });
  });

  it('returns active linked stylesheet content for alias imports and ignores blank queries', async () => {
    transformersMock.extractor.mockImplementation(async (text: string) => ({
      data: text.toLowerCase().includes('widget') ? [1, 0, 0] : [0, 1, 0],
    }));
    const onMessage = listeners.message;
    await onMessage({
      data: {
        id: 'sync-css',
        type: 'SYNC_WORKSPACE',
        payload: {
          files: {
            'src/Widget.tsx':
              "import styles from '@/theme.css';\nexport const Widget = () => null;",
            'src/theme.css': '.widget { color: rebeccapurple; }',
          },
        },
      },
    });

    mockSelf.postMessage.mockClear();
    await onMessage({
      data: { id: 'search-widget', type: 'SEARCH', payload: { query: 'widget', k: 3 } },
    });
    const widgetResults = mockSelf.postMessage.mock.calls[0][0] as {
      payload: Array<{ filePath: string; linkedCss: Array<{ filePath: string; content: string }> }>;
    };
    expect(
      widgetResults.payload.find(({ filePath }) => filePath === 'src/Widget.tsx'),
    ).toMatchObject({
      filePath: 'src/Widget.tsx',
      linkedCss: [{ filePath: 'src/theme.css', content: '.widget { color: rebeccapurple; }' }],
    });

    const embeddingCallsBeforeBlankQuery = transformersMock.extractor.mock.calls.length;
    mockSelf.postMessage.mockClear();
    await onMessage({ data: { id: 'search-empty', type: 'SEARCH', payload: { query: '   ' } } });
    expect(mockSelf.postMessage).toHaveBeenCalledWith({
      id: 'search-empty',
      type: 'SEARCH_SUCCESS',
      payload: [],
    });
    expect(transformersMock.extractor).toHaveBeenCalledTimes(embeddingCallsBeforeBlankQuery);
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

  it('splits code along symbol boundaries and prefixes chunks with file and symbol headers', () => {
    const code = [
      "import styles from './Navbar.module.css';",
      '',
      'export function Navbar() {',
      '  return <nav className={styles.nav}>Brand</nav>;',
      '}',
      '',
      'export const Footer = () => {',
      '  return <footer>Copyright 2026</footer>;',
      '};',
    ].join('\n');

    const chunks = testables.splitIntoChunks(code, 'src/Navbar.jsx');
    expect(chunks.some((chunk) => chunk.includes('// File: src/Navbar.jsx | Symbol: Navbar'))).toBe(
      true,
    );
    expect(chunks.some((chunk) => chunk.includes('// File: src/Navbar.jsx | Symbol: Footer'))).toBe(
      true,
    );
  });
});
