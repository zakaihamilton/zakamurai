import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockStorageManager } from '../../test-utils/domMocks';
import { releaseWebLLMGpuMemory, reserveWebLLMGpuMemory } from '../ai-memory-governor';
import { RAG_EXTRACTOR_IDLE_UNLOAD_MS, RagSearchUtility } from './search-utility';

const { mockDispose, mockInit, mockSearch, mockUnloadModel } = vi.hoisted(() => ({
  mockDispose: vi.fn(),
  mockInit: vi.fn(),
  mockSearch: vi.fn(),
  mockUnloadModel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./indexer-controller.js', () => {
  return {
    IndexerController: vi.fn().mockImplementation(() => {
      return {
        dispose: mockDispose,
        init: mockInit,
        search: mockSearch,
        unloadModel: mockUnloadModel,
      };
    }),
  };
});

describe('RagSearchUtility', () => {
  let originalNavigator: Navigator;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    originalNavigator = global.navigator;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    releaseWebLLMGpuMemory();
    global.navigator = originalNavigator;
  });

  it('formats retrieved context correctly with linked CSS', () => {
    const utility = new RagSearchUtility();

    const mockResults = [
      {
        filePath: 'Button.js',
        content:
          'export function Button() { return <button className={styles.btn}>Click</button>; }',
        score: 0.1,
        linkedCss: [
          {
            filePath: 'Button.module.css',
            content: '.btn { color: red; }',
          },
        ],
      },
    ];

    const formatted = utility.formatPromptContext(mockResults);

    expect(formatted).toContain('### Code Context from Workspace:');
    expect(formatted).toContain('--- File: Button.js ---');
    expect(formatted).toContain('export function Button');
    expect(formatted).toContain('--- Linked CSS: Button.module.css ---');
    expect(formatted).toContain('.btn { color: red; }');
    expect(formatted).toContain('### End Code Context');
  });

  it('handles empty results gracefully', () => {
    const utility = new RagSearchUtility();
    const formatted = utility.formatPromptContext([]);
    expect(formatted).toBe('');
  });

  it('uses WASM and releases the extractor after an idle delay while WebLLM owns WebGPU', async () => {
    mockInit.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue([]);
    reserveWebLLMGpuMemory();
    const utility = new RagSearchUtility();

    await utility.retrieveContext('button', 1);

    expect(mockSearch).toHaveBeenCalledWith('button', 1, 'wasm');
    expect(mockUnloadModel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(RAG_EXTRACTOR_IDLE_UNLOAD_MS);
    expect(mockUnloadModel).toHaveBeenCalledOnce();
  });

  it('reuses the extractor across nearby requests and resets the idle delay', async () => {
    mockInit.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue([]);
    const utility = new RagSearchUtility();

    await utility.retrieveContext('first', 1);
    await vi.advanceTimersByTimeAsync(RAG_EXTRACTOR_IDLE_UNLOAD_MS - 1);
    await utility.retrieveContext('second', 1);
    await vi.advanceTimersByTimeAsync(RAG_EXTRACTOR_IDLE_UNLOAD_MS - 1);

    expect(mockUnloadModel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mockUnloadModel).toHaveBeenCalledOnce();
  });

  it('supports immediate coordinated unload and cancels the idle unload', async () => {
    mockInit.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue([]);
    const utility = new RagSearchUtility();

    await utility.retrieveContext('button', 1);
    await utility.unloadModel();

    expect(mockUnloadModel).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(RAG_EXTRACTOR_IDLE_UNLOAD_MS);
    expect(mockUnloadModel).toHaveBeenCalledOnce();
  });

  it('can terminate a stuck extractor operation before WebLLM starts', async () => {
    mockInit.mockResolvedValue(undefined);
    const utility = new RagSearchUtility();
    await utility.init();

    utility.forceUnloadModel();

    expect(mockDispose).toHaveBeenCalledOnce();
    expect(utility.isInitialized).toBe(false);
  });

  it('retrieves and enriches context with CSS modules from OPFS', async () => {
    const mockFile = {
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue('.btn { color: red; }'),
      }),
    };
    const mockDir = {
      getDirectoryHandle: vi.fn().mockResolvedValue({
        getFileHandle: vi.fn().mockResolvedValue(mockFile),
      }),
      getFileHandle: vi.fn().mockResolvedValue(mockFile),
    };
    global.navigator = {
      ...originalNavigator,
      storage: mockStorageManager({
        getDirectory: vi.fn().mockResolvedValue(mockDir),
      }),
    } as Navigator;

    mockInit.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue([
      {
        filePath: 'components/Button.js',
        content: 'export function Button() {}',
        score: 0.9,
        cssLinks: JSON.stringify(['./Button.module.css']),
      },
    ]);

    const utility = new RagSearchUtility();
    const results = await utility.retrieveContext('button', 1);

    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('components/Button.js');
    expect(results[0].linkedCss).toHaveLength(1);
    expect(results[0].linkedCss[0].filePath).toBe('Button.module.css');
    expect(results[0].linkedCss[0].content).toBe('.btn { color: red; }');
    expect(mockSearch).toHaveBeenCalledWith('button', 1, 'webgpu');
    expect(mockUnloadModel).not.toHaveBeenCalled();
  });

  it('handles OPFS read errors and parsing errors gracefully', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.navigator = {
      ...originalNavigator,
      storage: mockStorageManager({
        getDirectory: vi.fn().mockRejectedValue(new Error('Storage Denied')),
      }),
    } as Navigator;

    mockInit.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue([
      {
        filePath: 'components/Button.js',
        content: 'export function Button() {}',
        score: 0.9,
        // Calls _readOpfsFile but fails inside it (covering catch block)
        cssLinks: JSON.stringify(['Button.module.css']),
      },
      {
        filePath: 'components/Button.js',
        content: 'export function Button() {}',
        score: 0.9,
        // Causes JSON parsing error
        cssLinks: 'invalid-json-link-format',
      },
    ]);

    const utility = new RagSearchUtility();
    const results = await utility.retrieveContext('button', 2);

    expect(results).toHaveLength(2);
    expect(results[0].linkedCss).toHaveLength(0);
    expect(results[1].linkedCss).toHaveLength(0);
    expect(consoleWarn).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('handles relative path resolution containing parent segment ..', async () => {
    const mockFile = {
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue('.btn { color: blue; }'),
      }),
    };
    const mockDir = {
      getDirectoryHandle: vi.fn().mockResolvedValue({
        getFileHandle: vi.fn().mockResolvedValue(mockFile),
      }),
      getFileHandle: vi.fn().mockResolvedValue(mockFile),
    };
    global.navigator = {
      ...originalNavigator,
      storage: mockStorageManager({
        getDirectory: vi.fn().mockResolvedValue(mockDir),
      }),
    } as Navigator;

    mockInit.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue([
      {
        filePath: 'components/nested/Button.js',
        content: 'export function Button() {}',
        score: 0.9,
        cssLinks: JSON.stringify(['nested/../Button.module.css']),
      },
    ]);

    const utility = new RagSearchUtility();
    const results = await utility.retrieveContext('button', 1);
    expect(results[0].linkedCss).toHaveLength(1);
  });
});
