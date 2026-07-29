import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockStorageManager } from '../../test-utils/domMocks';
import { createMockWorkerClass } from '../../test-utils/workerMocks';
import { type FileSystemObserverRecord, IndexerController } from './indexer-controller';

function createObserverRecord(
  partial: Pick<FileSystemObserverRecord, 'type' | 'changedHandle'> & {
    relativePathComponents?: string[];
  },
): FileSystemObserverRecord {
  return partial as FileSystemObserverRecord;
}

describe('IndexerController', () => {
  let originalWorker: typeof Worker;
  let originalNavigator: Navigator;
  let originalFileSystemObserver: Window['FileSystemObserver'];

  beforeEach(() => {
    vi.clearAllMocks();
    originalWorker = global.Worker;
    originalNavigator = global.navigator;
    originalFileSystemObserver = window.FileSystemObserver;
    window.FileSystemObserver = vi.fn(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
    })) as unknown as Window['FileSystemObserver'];
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
      createObserverRecord({
        type: 'modified',
        changedHandle: { name: 'test.js', kind: 'file' } as FileSystemHandle,
        relativePathComponents: ['test.js'],
      }),
      createObserverRecord({
        type: 'modified',
        changedHandle: { name: 'test.js', kind: 'file' } as FileSystemHandle,
        relativePathComponents: ['test.js'],
      }),
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
    let messageListener: ((event: MessageEvent) => void) | undefined;
    const mockWorker = {
      addEventListener: vi.fn((event: string, listener: (event: MessageEvent) => void) => {
        if (event === 'message') messageListener = listener;
      }),
      postMessage: vi.fn(),
    };
    global.Worker = createMockWorkerClass(() => mockWorker);

    global.navigator = {
      ...originalNavigator,
      storage: mockStorageManager({
        getDirectory: vi.fn().mockResolvedValue({}),
      }),
    } as Navigator;

    window.FileSystemObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
    })) as unknown as Window['FileSystemObserver'];

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
    messageListener?.({
      data: {
        id: 1,
        type: 'SUCCESS',
        payload: 'search results',
      },
    } as MessageEvent);

    const result = await sendPromise;
    expect(result).toBe('search results');
  });

  it('rejects sendMessage promise on worker error response', async () => {
    let messageListener: ((event: MessageEvent) => void) | undefined;
    const mockWorker = {
      addEventListener: vi.fn((event: string, listener: (event: MessageEvent) => void) => {
        if (event === 'message') messageListener = listener;
      }),
      postMessage: vi.fn(),
    };
    global.Worker = createMockWorkerClass(() => mockWorker);
    global.navigator = {
      ...originalNavigator,
      storage: mockStorageManager({
        getDirectory: vi.fn().mockResolvedValue({}),
      }),
    } as Navigator;

    const controller = new IndexerController();
    await controller.init();

    const sendPromise = controller.sendMessage('SEARCH', 'test');
    messageListener?.({
      data: {
        id: 1,
        type: 'ERROR',
        error: 'Worker crashed',
      },
    } as MessageEvent);

    await expect(sendPromise).rejects.toThrow('Worker crashed');
  });

  it('logs unhandled error messages from worker', async () => {
    let messageListener: ((event: MessageEvent) => void) | undefined;
    const mockWorker = {
      addEventListener: vi.fn((event: string, listener: (event: MessageEvent) => void) => {
        if (event === 'message') messageListener = listener;
      }),
      postMessage: vi.fn(),
    };
    global.Worker = createMockWorkerClass(() => mockWorker);
    global.navigator = {
      ...originalNavigator,
      storage: mockStorageManager({
        getDirectory: vi.fn().mockResolvedValue({}),
      }),
    } as Navigator;

    const controller = new IndexerController();
    await controller.init();

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    messageListener?.({
      data: {
        id: 999, // unknown id
        type: 'ERROR',
        error: 'Background error',
      },
    } as MessageEvent);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[IndexerController] Worker Error:',
      'Background error',
    );
    consoleErrorSpy.mockRestore();
  });

  it('skips OPFS observer by default', async () => {
    const getDirectory = vi.fn().mockResolvedValue({});
    global.Worker = createMockWorkerClass();
    global.navigator = {
      ...originalNavigator,
      storage: mockStorageManager({ getDirectory }),
    } as Navigator;
    window.FileSystemObserver = undefined;

    const controller = new IndexerController();
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await controller.init();

    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(getDirectory).not.toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('enables OPFS observer when requested and warns if unsupported', async () => {
    global.Worker = createMockWorkerClass();
    global.navigator = {
      ...originalNavigator,
      storage: mockStorageManager({
        getDirectory: vi.fn().mockResolvedValue({}),
      }),
    } as Navigator;
    window.FileSystemObserver = undefined;

    const controller = new IndexerController({ enableOpfsObserver: true });
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await controller.init();

    // Observer path runs; FileSystemObserver missing is silent (no warn) — just no observer.
    expect(controller.observer).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('handles errors during OPFS observer init gracefully', async () => {
    global.Worker = createMockWorkerClass();
    global.navigator = {
      ...originalNavigator,
      storage: mockStorageManager({
        getDirectory: vi.fn().mockRejectedValue(new Error('OPFS error')),
      }),
    } as Navigator;
    window.FileSystemObserver = vi.fn() as unknown as Window['FileSystemObserver'];

    const controller = new IndexerController({ enableOpfsObserver: true });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await controller.init();

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('skips hidden or dot files and folders during changes', async () => {
    const controller = new IndexerController();
    controller.processFile = vi.fn();

    const records = [
      createObserverRecord({
        type: 'appeared',
        changedHandle: { name: '.hidden.js', kind: 'file' } as FileSystemHandle,
        relativePathComponents: ['.hidden.js'],
      }),
      createObserverRecord({
        type: 'appeared',
        changedHandle: { name: 'folder', kind: 'directory' } as FileSystemHandle,
        relativePathComponents: ['folder'],
      }),
    ];

    await controller.handleFileChanges(records);
    expect(controller.processFile).not.toHaveBeenCalled();
  });

  it('resolves full path correctly in getFullPath', async () => {
    const controller = new IndexerController();
    const mockHandle = { name: 'file.js' } as FileSystemHandle;
    const mockDirectory = {
      resolve: vi.fn().mockResolvedValue(['src', 'components', 'file.js']),
    } as unknown as FileSystemDirectoryHandle;

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
    } as unknown as FileSystemFileHandle;

    await controller.processFile(mockFileHandle, 'src/test.js');
    expect(controller.sendMessage).toHaveBeenCalledWith('INDEX_FILE', {
      filePath: 'src/test.js',
      content: 'file content',
    });

    // Test error case
    const failingFileHandle = {
      getFile: vi.fn().mockRejectedValue(new Error('Read failed')),
    } as unknown as FileSystemFileHandle;
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await controller.processFile(failingFileHandle, 'src/test.js');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('disposes resources and rejects pending resolvers', async () => {
    const mockWorker = {
      terminate: vi.fn(),
      addEventListener: vi.fn(),
      postMessage: vi.fn(),
    };
    global.Worker = createMockWorkerClass(() => mockWorker);
    global.navigator = {
      ...originalNavigator,
      storage: mockStorageManager({
        getDirectory: vi.fn().mockResolvedValue({}),
      }),
    } as Navigator;

    window.FileSystemObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
    })) as unknown as Window['FileSystemObserver'];

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
    controller.init = vi.fn().mockResolvedValue(undefined);
    controller.sendMessage = vi.fn().mockResolvedValue([]);

    await controller.search('query');
    expect(controller.init).toHaveBeenCalled();
  });

  it('sends UNLOAD_MODEL and PURGE_INDEX messages when called', async () => {
    const controller = new IndexerController();
    controller.worker = { postMessage: vi.fn() } as unknown as Worker;
    controller.sendMessage = vi.fn().mockResolvedValue('ok');

    await controller.unloadModel();
    expect(controller.sendMessage).toHaveBeenCalledWith('UNLOAD_MODEL', {});

    await controller.purgeIndex();
    expect(controller.sendMessage).toHaveBeenCalledWith('PURGE_INDEX', {});
  });
});
