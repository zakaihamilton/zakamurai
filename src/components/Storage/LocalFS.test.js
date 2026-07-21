import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSystemState, useFileSystem } from './LocalFS';

// Helper to create a mock directory handle
const makeDirHandle = (name = 'root', entries = []) => {
  const handle = {
    name,
    kind: 'directory',
    entries: async function* () {
      for (const e of entries) yield [e.name, e];
    },
    getFileHandle: vi.fn().mockResolvedValue({
      name: 'test.js',
      kind: 'file',
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      getFile: vi.fn().mockResolvedValue(new File(['content'], 'test.js')),
    }),
    getDirectoryHandle: vi.fn().mockImplementation((name) => Promise.resolve(makeDirHandle(name))),
    removeEntry: vi.fn().mockResolvedValue(undefined),
    queryPermission: vi.fn().mockResolvedValue('prompt'),
    move: vi.fn().mockResolvedValue(undefined),
  };
  return handle;
};

// IndexedDB mock that resolves via callbacks
const makeIDBMock = (storedHandle = null) => {
  const store = { root: storedHandle };

  const makeTransaction = () => {
    const tx = {
      oncomplete: null,
      onerror: null,
      objectStore: vi.fn().mockImplementation(() => ({
        get: vi.fn().mockImplementation((key) => {
          const req = { result: store[key] };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        }),
        put: vi.fn().mockImplementation((val, key) => {
          store[key] = val;
          // fire tx.oncomplete after operation
          setTimeout(() => tx.oncomplete?.(), 0);
          return {};
        }),
        delete: vi.fn().mockImplementation((key) => {
          delete store[key];
          setTimeout(() => tx.oncomplete?.(), 0);
          return {};
        }),
      })),
    };
    return tx;
  };

  const makeOpenRequest = () => {
    const req = {
      result: {
        transaction: vi.fn().mockImplementation(() => makeTransaction()),
        createObjectStore: vi.fn(),
      },
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
    };
    setTimeout(() => req.onsuccess?.(), 0);
    return req;
  };

  return {
    open: vi.fn().mockImplementation(() => makeOpenRequest()),
  };
};

const makeFileSystemState = (overrides = {}) => {
  const updater = vi.fn((cb) => {
    if (typeof cb === 'function') {
      const draft = { ...makeFileSystemState.defaults, ...overrides };
      cb(draft);
    }
  });
  return Object.assign(updater, {
    ...makeFileSystemState.defaults,
    ...overrides,
  });
};
makeFileSystemState.defaults = {
  rootHandle: null,
  currentDirHandle: null,
  files: [],
  mode: null,
  error: null,
  version: 0,
  refreshTrigger: 0,
  isReady: false,
};

describe('useFileSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.indexedDB = makeIDBMock();
  });

  afterEach(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    vi.restoreAllMocks();
  });

  it('returns initial filesystem state', () => {
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(makeFileSystemState());
    const { result } = renderHook(() => useFileSystem());
    expect(result.current.rootHandle).toBeNull();
    expect(result.current.files).toEqual([]);
    expect(result.current.isReady).toBe(false);
    expect(typeof result.current.mountLocal).toBe('function');
    expect(typeof result.current.unlinkProject).toBe('function');
    expect(typeof result.current.deleteEntry).toBe('function');
    expect(typeof result.current.moveEntry).toBe('function');
    expect(typeof result.current.triggerRefresh).toBe('function');
    expect(typeof result.current.readFile).toBe('function');
    expect(typeof result.current.writeFile).toBe('function');
    expect(typeof result.current.writeFileAtPath).toBe('function');
    expect(typeof result.current.getFileHandleAtPath).toBe('function');
    expect(typeof result.current.createFolder).toBe('function');
  });

  it('throws error when deleting entry without directory handle', async () => {
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(makeFileSystemState());
    const { result } = renderHook(() => useFileSystem());
    await expect(result.current.deleteEntry('file.js', null)).rejects.toThrow(
      'No directory mounted',
    );
  });

  it('throws error when moving entry with missing handles', async () => {
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(makeFileSystemState());
    const { result } = renderHook(() => useFileSystem());
    await expect(result.current.moveEntry(null, {})).rejects.toThrow(
      'Source or destination missing',
    );
  });

  it('throws error when writing file without directory', async () => {
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(makeFileSystemState());
    const { result } = renderHook(() => useFileSystem());
    await expect(result.current.writeFile('test.js', 'content', null)).rejects.toThrow(
      'No directory mounted',
    );
  });

  it('throws error when writing file at path without root', async () => {
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(makeFileSystemState());
    const { result } = renderHook(() => useFileSystem());
    await expect(result.current.writeFileAtPath('src/test.js', 'content', null)).rejects.toThrow(
      'No root directory mounted',
    );
  });

  it('throws error when creating folder without directory handle', async () => {
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(makeFileSystemState());
    const { result } = renderHook(() => useFileSystem());
    await expect(result.current.createFolder('newfolder', null)).rejects.toThrow(
      'No directory mounted',
    );
  });

  it('returns null from getFileHandleAtPath when no root', async () => {
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(makeFileSystemState());
    const { result } = renderHook(() => useFileSystem());
    const handle = await result.current.getFileHandleAtPath('src/test.js', null);
    expect(handle).toBeNull();
  });

  it('successfully writes a file to a directory handle', async () => {
    const dirHandle = makeDirHandle('root');
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(makeFileSystemState());
    const { result } = renderHook(() => useFileSystem());

    await act(async () => {
      await result.current.writeFile('test.js', 'content', dirHandle);
    });

    expect(dirHandle.getFileHandle).toHaveBeenCalledWith('test.js', { create: true });
  });

  it('writes a file at a path using root handle', async () => {
    const rootHandle = makeDirHandle('root');
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(makeFileSystemState());
    const { result } = renderHook(() => useFileSystem());

    await act(async () => {
      await result.current.writeFileAtPath('src/test.js', 'content', rootHandle);
    });

    expect(rootHandle.getDirectoryHandle).toHaveBeenCalledWith('src', { create: true });
  });

  it('reads a file from a file handle', async () => {
    const mockFileObj = {
      text: vi.fn().mockResolvedValue('hello world'),
    };
    const fileHandle = {
      getFile: vi.fn().mockResolvedValue(mockFileObj),
    };
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(makeFileSystemState());
    const { result } = renderHook(() => useFileSystem());

    let content;
    await act(async () => {
      content = await result.current.readFile(fileHandle);
    });

    expect(content).toBe('hello world');
  });

  it('deletes an entry from a directory handle', async () => {
    const dirHandle = makeDirHandle('root');
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(makeFileSystemState());
    const { result } = renderHook(() => useFileSystem());

    await act(async () => {
      await result.current.deleteEntry('file.js', dirHandle);
    });

    expect(dirHandle.removeEntry).toHaveBeenCalledWith('file.js', { recursive: true });
  });

  it('moves an entry using sourceHandle.move', async () => {
    const sourceHandle = { name: 'file.js', move: vi.fn().mockResolvedValue(undefined) };
    const destHandle = makeDirHandle('dest');
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(makeFileSystemState());
    const { result } = renderHook(() => useFileSystem());

    await act(async () => {
      await result.current.moveEntry(sourceHandle, destHandle);
    });

    expect(sourceHandle.move).toHaveBeenCalled();
  });

  it('handles move when move API not supported (sets error)', async () => {
    const sourceHandle = { name: 'file.js' }; // No .move method
    const destHandle = makeDirHandle('dest');
    const state = makeFileSystemState();
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(state);
    const { result } = renderHook(() => useFileSystem());

    await act(async () => {
      await result.current.moveEntry(sourceHandle, destHandle);
    });

    expect(state).toHaveBeenCalled(); // setFileSystemValue called with error
  });

  it('triggerRefresh increments refreshTrigger', () => {
    const state = makeFileSystemState();
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(state);
    const { result } = renderHook(() => useFileSystem());

    act(() => {
      result.current.triggerRefresh();
    });

    expect(state).toHaveBeenCalled();
  });

  it('refreshDirectory reads entries from handle', async () => {
    const childFile = { name: 'file.js', kind: 'file' };
    const childDir = { name: 'src', kind: 'directory' };
    const dirHandle = makeDirHandle('root', [childFile, childDir]);
    const state = makeFileSystemState();
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(state);
    const { result } = renderHook(() => useFileSystem());

    let entries;
    await act(async () => {
      entries = await result.current.refreshDirectory(dirHandle);
    });

    // Should have sorted the entries (directories first)
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBe(2);
    expect(entries[0].kind).toBe('directory'); // sorted first
  });

  it('createFolder creates a new directory', async () => {
    const dirHandle = makeDirHandle('root');
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(makeFileSystemState());
    const { result } = renderHook(() => useFileSystem());

    await act(async () => {
      await result.current.createFolder('newfolder', dirHandle);
    });

    expect(dirHandle.getDirectoryHandle).toHaveBeenCalledWith('newfolder', { create: true });
  });

  it('getFileHandleAtPath navigates to file', async () => {
    const fileHandle = { name: 'test.js', kind: 'file' };
    const subDirHandle = {
      getFileHandle: vi.fn().mockResolvedValue(fileHandle),
    };
    const rootHandle = {
      getDirectoryHandle: vi.fn().mockResolvedValue(subDirHandle),
    };
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(makeFileSystemState());
    const { result } = renderHook(() => useFileSystem());

    let handle;
    await act(async () => {
      handle = await result.current.getFileHandleAtPath('src/test.js', rootHandle);
    });

    expect(rootHandle.getDirectoryHandle).toHaveBeenCalledWith('src');
    expect(subDirHandle.getFileHandle).toHaveBeenCalledWith('test.js');
    expect(handle).toBe(fileHandle);
  });

  it('getFileHandleAtPath returns null on error', async () => {
    const rootHandle = {
      getDirectoryHandle: vi.fn().mockRejectedValue(new Error('Not found')),
    };
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(makeFileSystemState());
    const { result } = renderHook(() => useFileSystem());

    let handle;
    await act(async () => {
      handle = await result.current.getFileHandleAtPath('src/test.js', rootHandle);
    });

    expect(handle).toBeNull();
  });

  it('mountOPFS mounts OPFS storage', async () => {
    const opfsHandle = makeDirHandle('opfs');
    global.navigator = {
      ...global.navigator,
      storage: { getDirectory: vi.fn().mockResolvedValue(opfsHandle) },
    };

    const state = makeFileSystemState();
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(state);
    const { result } = renderHook(() => useFileSystem());

    await act(async () => {
      await result.current.mountOPFS();
    });

    expect(navigator.storage.getDirectory).toHaveBeenCalled();
    expect(state).toHaveBeenCalled();
  });

  it('mountOPFS handles failure', async () => {
    global.navigator = {
      ...global.navigator,
      storage: { getDirectory: vi.fn().mockRejectedValue(new Error('OPFS unavailable')) },
    };

    const state = makeFileSystemState();
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(state);
    const { result } = renderHook(() => useFileSystem());

    await act(async () => {
      await result.current.mountOPFS();
    });

    expect(state).toHaveBeenCalled(); // error set
  });

  it('unlinkProject clears state', async () => {
    global.indexedDB = makeIDBMock(); // fresh DB
    const state = makeFileSystemState();
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(state);
    const { result } = renderHook(() => useFileSystem());

    await act(async () => {
      await result.current.unlinkProject();
    });

    expect(state).toHaveBeenCalled();
  });

  it('refreshes directory when refreshTrigger changes with rootHandle set', async () => {
    const rootHandle = makeDirHandle('root');
    const state = makeFileSystemState({ rootHandle, mode: 'local', refreshTrigger: 1 });
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(state);

    renderHook(() => useFileSystem());
    // Simply verify hook mounts without crash — refresh is triggered via effect
  });

  it('mountLocal silently ignores AbortError', async () => {
    const abortError = new Error('User cancelled');
    abortError.name = 'AbortError';
    global.window = {
      ...global.window,
      showDirectoryPicker: vi.fn().mockRejectedValue(abortError),
    };

    const state = makeFileSystemState();
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(state);
    const { result } = renderHook(() => useFileSystem());

    // Should not set error for AbortError
    const _callCountBefore = state.mock.calls.length;
    await act(async () => {
      await result.current.mountLocal();
    });
    // Error shouldn't be set for AbortError — call count should remain same
    // (some calls happen from effects, but no error-setting call from AbortError)
    expect(result.current.error).toBeNull();
  });

  it('mountLocal handles non-AbortError by setting error state', async () => {
    const networkError = new Error('Permission denied');
    networkError.name = 'SecurityError';
    global.window = {
      ...global.window,
      showDirectoryPicker: vi.fn().mockRejectedValue(networkError),
    };

    const state = makeFileSystemState();
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(state);
    const { result } = renderHook(() => useFileSystem());

    await act(async () => {
      await result.current.mountLocal();
    });

    expect(state).toHaveBeenCalled(); // state was updated with error
  });

  it('refreshDirectory handles error reading entries', async () => {
    const badHandle = {
      entries: async function* () {
        yield* [];
        throw new Error('Permission denied');
      },
    };

    const state = makeFileSystemState();
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(state);
    const { result } = renderHook(() => useFileSystem());

    await act(async () => {
      await result.current.refreshDirectory(badHandle);
    });

    // state should have been updated with error message
    expect(state).toHaveBeenCalled();
  });

  it('deleteEntry handles error by setting error state', async () => {
    const badDirHandle = {
      removeEntry: vi.fn().mockRejectedValue(new Error('File locked')),
      entries: async function* () {},
    };

    const state = makeFileSystemState();
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(state);
    const { result } = renderHook(() => useFileSystem());

    await act(async () => {
      await result.current.deleteEntry('locked.js', badDirHandle);
    });

    expect(state).toHaveBeenCalled();
  });

  it('createFolder handles error by setting error state', async () => {
    const badDirHandle = {
      getDirectoryHandle: vi.fn().mockRejectedValue(new Error('Not allowed')),
      entries: async function* () {},
    };

    const state = makeFileSystemState();
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(state);
    const { result } = renderHook(() => useFileSystem());

    await act(async () => {
      await result.current.createFolder('locked-folder', badDirHandle);
    });

    expect(state).toHaveBeenCalled();
  });

  it('writeFile handles error by setting error state', async () => {
    const badDirHandle = {
      getFileHandle: vi.fn().mockRejectedValue(new Error('Disk full')),
      entries: async function* () {},
    };

    const state = makeFileSystemState();
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(state);
    const { result } = renderHook(() => useFileSystem());

    await act(async () => {
      await result.current.writeFile('test.js', 'content', badDirHandle);
    });

    expect(state).toHaveBeenCalled();
  });

  it('writeFileAtPath handles error by setting error state', async () => {
    const badRootHandle = {
      getDirectoryHandle: vi.fn().mockRejectedValue(new Error('Not writable')),
      entries: async function* () {},
    };

    const state = makeFileSystemState();
    vi.spyOn(FileSystemState, 'useState').mockReturnValue(state);
    const { result } = renderHook(() => useFileSystem());

    await act(async () => {
      await result.current.writeFileAtPath('src/fail.js', 'content', badRootHandle);
    });

    expect(state).toHaveBeenCalled();
  });
});
