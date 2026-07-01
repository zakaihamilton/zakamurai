import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { IndexerController } from './indexer-controller.js';

describe('IndexerController', () => {
  let originalWorker;
  let originalNavigator;
  let originalFileSystemObserver;

  beforeEach(() => {
    vi.clearAllMocks();
    originalWorker = global.Worker;
    originalNavigator = global.navigator;
    originalFileSystemObserver = window.FileSystemObserver;
  });

  afterEach(() => {
    global.Worker = originalWorker;
    global.navigator = originalNavigator;
    window.FileSystemObserver = originalFileSystemObserver;
  });

  it('debounces multiple file changes for the same file', async () => {
    vi.useFakeTimers();
    const controller = new IndexerController();

    // Mock the processFile to just be a spy
    controller.processFile = vi.fn();

    // Create mock records representing multiple rapid edits to the same file
    const records = [
      {
        type: 'modified',
        changedHandle: { name: 'test.js', kind: 'file' },
        relativePathComponents: ['test.js'],
      },
      {
        type: 'modified',
        changedHandle: { name: 'test.js', kind: 'file' },
        relativePathComponents: ['test.js'],
      },
    ];

    await controller.handleFileChanges(records);

    // Should not have been called yet because of the 750ms debounce
    expect(controller.processFile).not.toHaveBeenCalled();

    // Fast forward time past debounce
    vi.advanceTimersByTime(800);

    // Should only be called once despite multiple events
    expect(controller.processFile).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('initializes worker and resolves messages sent to worker', async () => {
    let messageListener;
    const mockWorker = {
      addEventListener: vi.fn((event, listener) => {
        if (event === 'message') messageListener = listener;
      }),
      postMessage: vi.fn(),
    };
    global.Worker = vi.fn(() => mockWorker);

    global.navigator = {
      storage: {
        getDirectory: vi.fn().mockResolvedValue({}),
      },
    };

    window.FileSystemObserver = vi.fn().mockImplementation(() => {
      return {
        observe: vi.fn(),
      };
    });

    const controller = new IndexerController();
    await controller.init();

    expect(global.Worker).toHaveBeenCalled();

    // Test sendMessage
    const sendPromise = controller.sendMessage('SEARCH', 'test');
    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      id: 1,
      type: 'SEARCH',
      payload: 'test',
    });

    // Simulate worker responding successfully
    messageListener({
      data: {
        id: 1,
        type: 'SUCCESS',
        payload: 'search results',
      },
    });

    const result = await sendPromise;
    expect(result).toBe('search results');
  });

  it('rejects sendMessage promise on worker error response', async () => {
    let messageListener;
    const mockWorker = {
      addEventListener: vi.fn((event, listener) => {
        if (event === 'message') messageListener = listener;
      }),
      postMessage: vi.fn(),
    };
    global.Worker = vi.fn(() => mockWorker);
    global.navigator = { storage: { getDirectory: vi.fn().mockResolvedValue({}) } };

    const controller = new IndexerController();
    await controller.init();

    const sendPromise = controller.sendMessage('SEARCH', 'test');
    messageListener({
      data: {
        id: 1,
        type: 'ERROR',
        error: 'Worker crashed',
      },
    });

    await expect(sendPromise).rejects.toThrow('Worker crashed');
  });

  it('logs unhandled error messages from worker', async () => {
    let messageListener;
    const mockWorker = {
      addEventListener: vi.fn((event, listener) => {
        if (event === 'message') messageListener = listener;
      }),
      postMessage: vi.fn(),
    };
    global.Worker = vi.fn(() => mockWorker);
    global.navigator = { storage: { getDirectory: vi.fn().mockResolvedValue({}) } };

    const controller = new IndexerController();
    await controller.init();

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    messageListener({
      data: {
        id: 999, // unknown id
        type: 'ERROR',
        error: 'Background error',
      },
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith('[IndexerController] Worker Error:', 'Background error');
    consoleErrorSpy.mockRestore();
  });

  it('warns when FileSystemObserver is not supported', async () => {
    global.Worker = vi.fn(() => ({ addEventListener: vi.fn(), postMessage: vi.fn() }));
    global.navigator = { storage: { getDirectory: vi.fn().mockResolvedValue({}) } };
    delete window.FileSystemObserver;

    const controller = new IndexerController();
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await controller.init();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[IndexerController] FileSystemObserver is not supported in this browser. RAG auto-indexing disabled.'
    );
    consoleWarnSpy.mockRestore();
  });

  it('handles errors during init gracefully', async () => {
    global.Worker = vi.fn(() => ({ addEventListener: vi.fn(), postMessage: vi.fn() }));
    global.navigator = {
      storage: {
        getDirectory: vi.fn().mockRejectedValue(new Error('OPFS error')),
      },
    };

    const controller = new IndexerController();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await controller.init();

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('skips hidden or dot files and folders during changes', async () => {
    const controller = new IndexerController();
    controller.processFile = vi.fn();

    const records = [
      {
        type: 'appeared',
        changedHandle: { name: '.hidden.js', kind: 'file' },
        relativePathComponents: ['.hidden.js'],
      },
      {
        type: 'appeared',
        changedHandle: { name: 'folder', kind: 'directory' },
        relativePathComponents: ['folder'],
      },
    ];

    await controller.handleFileChanges(records);
    expect(controller.processFile).not.toHaveBeenCalled();
  });

  it('resolves full path correctly in getFullPath', async () => {
    const controller = new IndexerController();
    const mockHandle = { name: 'file.js' };
    const mockDirectory = {
      resolve: vi.fn().mockResolvedValue(['src', 'components', 'file.js']),
    };

    const path = await controller.getFullPath(mockHandle, mockDirectory);
    expect(path).toBe('src/components/file.js');

    const fallbackPath = await controller.getFullPath(mockHandle, null);
    expect(fallbackPath).toBe('file.js');
  });

  it('indexes files successfully and handles index errors in processFile', async () => {
    const controller = new IndexerController();
    controller.sendMessage = vi.fn().mockResolvedValue({});

    const mockFileHandle = {
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue('file content'),
      }),
    };

    await controller.processFile(mockFileHandle, 'src/test.js');
    expect(controller.sendMessage).toHaveBeenCalledWith('INDEX_FILE', {
      filePath: 'src/test.js',
      content: 'file content',
    });

    // Test error case
    const failingFileHandle = {
      getFile: vi.fn().mockRejectedValue(new Error('Read failed')),
    };
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await controller.processFile(failingFileHandle, 'src/test.js');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('disposes resources and rejects pending resolvers', async () => {
    const mockWorker = { terminate: vi.fn(), addEventListener: vi.fn(), postMessage: vi.fn() };
    global.Worker = vi.fn(() => mockWorker);
    global.navigator = { storage: { getDirectory: vi.fn().mockResolvedValue({}) } };

    window.FileSystemObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
    }));

    const controller = new IndexerController();
    await controller.init();

    const sendPromise = controller.sendMessage('SEARCH', 'test');
    
    controller.dispose();

    expect(mockWorker.terminate).toHaveBeenCalled();
    expect(controller.observer).toBeNull();
    await expect(sendPromise).rejects.toThrow('[IndexerController] Disposed');
  });

  it('initializes on demand when searching', async () => {
    const controller = new IndexerController();
    controller.init = vi.fn().mockResolvedValue();
    controller.sendMessage = vi.fn().mockResolvedValue([]);

    await controller.search('query');
    expect(controller.init).toHaveBeenCalled();
  });
});
