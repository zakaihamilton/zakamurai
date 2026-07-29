import type { FileSystemStateShape } from '@/components/state/domain-types';
import type { Draft } from '@/components/state/types';
import { createState } from '@/components/state/State';
import type { FileSystemApi } from '@/components/App/types';
import { useCallback, useEffect, useMemo } from 'react';

const DB_NAME = 'ZakamuraiFS';
const STORE_NAME = 'handles';
const FS_INIT_TIMEOUT_MS = 3000;
export const FileSystemState = createState<FileSystemStateShape>('FileSystemState');

type DirEntry = { name: string; kind: FileSystemHandleKind; handle: FileSystemHandle };

const INITIAL_FS_STATE: FileSystemStateShape = {
  rootHandle: null,
  currentDirHandle: null,
  files: [],
  mode: null,
  error: null,
  version: 0,
  refreshTrigger: 0,
  isReady: false,
};

function withTimeout<T>(
  promise: Promise<T>,
  message: string,
  timeoutMs = FS_INIT_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

async function getDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await getDB();
  if (!db) return;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(handle, 'root');
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await getDB();
  if (!db) return null;
  const tx = db.transaction(STORE_NAME, 'readonly');
  const request = tx.objectStore(STORE_NAME).get('root');
  return new Promise((resolve, reject) => {
    request.onsuccess = () =>
      resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function clearHandle(): Promise<void> {
  const db = await getDB();
  if (!db) return;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete('root');
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Shared filesystem API backed by FileSystemState.
 * Pass `{ bootstrap: true }` only from App so init/restore runs once on the root Node.
 * Other callers omit bootstrap and look up the ancestor store (safe under nested Nodes).
 */
export function useFileSystem({ bootstrap = false } = {}): FileSystemApi {
  const fileSystemState = FileSystemState.useState(null, bootstrap ? INITIAL_FS_STATE : undefined);
  const {
    rootHandle = null,
    currentDirHandle = null,
    files = [],
    mode = null,
    error = null,
    version = 0,
    refreshTrigger = 0,
    isReady = false,
  } = fileSystemState || {};
  const setFileSystemValue = useCallback(
    <K extends keyof FileSystemStateShape>(
      key: K,
      nextValue:
        | FileSystemStateShape[K]
        | ((current: FileSystemStateShape[K]) => FileSystemStateShape[K]),
    ) => {
      if (!fileSystemState) return;
      fileSystemState((draft: Draft<FileSystemStateShape>) => {
        const current = draft[key];
        draft[key] = (
          typeof nextValue === 'function'
            ? (nextValue as (current: FileSystemStateShape[K]) => FileSystemStateShape[K])(current)
            : nextValue
        ) as FileSystemStateShape[K];
      });
    },
    [fileSystemState],
  );

  const triggerRefresh = useCallback(() => {
    setFileSystemValue('refreshTrigger', (v = 0) => v + 1);
  }, [setFileSystemValue]);

  // 1. Wrapped in useCallback so it can be safely used as a dependency
  const refreshDirectory = useCallback(
    async (dirHandle: FileSystemDirectoryHandle, updateSidebar = true) => {
      if (!fileSystemState) return;
      try {
        const entries: DirEntry[] = [];
        for await (const [name, handle] of dirHandle.entries()) {
          entries.push({ name, kind: handle.kind, handle });
        }

        entries.sort((a, b) => {
          if (a.kind === b.kind) return a.name.localeCompare(b.name);
          return a.kind === 'directory' ? -1 : 1;
        });

        // Only update global files list if we are refreshing the root
        // or if we are in a mode where currentDirHandle tracks the sidebar root
        if (updateSidebar) {
          fileSystemState((draft) => {
            draft.files = entries.map((entry) => ({
              name: entry.name,
              type: entry.kind === 'directory' ? 'folder' : 'file',
              path: [],
              kind: entry.kind,
            }));
            draft.currentDirHandle = dirHandle;
          });
        }
        fileSystemState((draft) => {
          draft.version = (draft.version || 0) + 1;
          draft.error = null;
        });
        return entries;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setFileSystemValue('error', `Failed to read directory: ${message}`);
      }
    },
    [fileSystemState, setFileSystemValue],
  );

  const mountOPFS = useCallback(async () => {
    if (!fileSystemState) return;
    try {
      const handle = await navigator.storage.getDirectory();
      fileSystemState((draft) => {
        draft.rootHandle = handle;
        draft.mode = 'opfs';
      });
      await refreshDirectory(handle);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFileSystemValue('error', `Failed to mount OPFS: ${message}`);
    }
  }, [fileSystemState, refreshDirectory, setFileSystemValue]); // Added missing dependency

  const mountLocal = useCallback(async () => {
    if (!fileSystemState || !window.showDirectoryPicker) return;
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      fileSystemState((draft) => {
        draft.rootHandle = handle;
        draft.mode = 'local';
      });
      await saveHandle(handle);
      await refreshDirectory(handle);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        const message = err instanceof Error ? err.message : String(err);
        setFileSystemValue('error', `Failed to mount local FS: ${message}`);
      }
    }
  }, [fileSystemState, refreshDirectory, setFileSystemValue]);

  useEffect(() => {
    if (!bootstrap || !fileSystemState) return undefined;
    let active = true;
    const init = async () => {
      try {
        const handle = await withTimeout(loadHandle(), 'Timed out restoring local file handle');
        if (!active) return;
        if (handle) {
          // Verify permission
          const status = await withTimeout(
            handle.queryPermission({ mode: 'readwrite' }),
            'Timed out checking local file permissions',
          );
          if (!active) return;
          if (status === 'granted') {
            fileSystemState((draft) => {
              draft.rootHandle = handle;
              draft.mode = 'local';
            });
            await withTimeout(refreshDirectory(handle), 'Timed out reading local project folder');
          }
        }
      } catch (err) {
        console.error('Failed to restore FS handle:', err);
      } finally {
        if (active) {
          setFileSystemValue('isReady', true);
        }
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [bootstrap, fileSystemState, refreshDirectory, setFileSystemValue]);

  // Handle manual refreshes via trigger (owner mount only)
  useEffect(() => {
    if (!bootstrap) return;
    if (rootHandle && mode && refreshTrigger > 0) {
      refreshDirectory(rootHandle);
    }
  }, [bootstrap, refreshTrigger, rootHandle, mode, refreshDirectory]);

  const readFile = useCallback(async (fileHandle: FileSystemFileHandle) => {
    const file = await fileHandle.getFile();
    return await file.text();
  }, []);

  // Wrapped in useCallback with currentDirHandle and refreshDirectory as deps
  const writeFile = useCallback(
    async (
      filename: string,
      content: string,
      dirHandle: FileSystemDirectoryHandle | null = currentDirHandle,
    ) => {
      if (!dirHandle) throw new Error('No directory mounted');
      try {
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        await refreshDirectory(dirHandle);
      } catch (err) {
        setFileSystemValue(
          'error',
          `Failed to write file: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [currentDirHandle, refreshDirectory, setFileSystemValue],
  );

  const writeFileAtPath = useCallback(
    async (path: string, content: string, root: FileSystemDirectoryHandle | null = rootHandle) => {
      if (!root) throw new Error('No root directory mounted');
      try {
        const parts = path.split('/').filter(Boolean);
        let currentHandle = root;
        for (let i = 0; i < parts.length - 1; i++) {
          currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create: true });
        }
        const fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1], {
          create: true,
        });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        await refreshDirectory(root); // Refresh from root to see changes everywhere
        return true;
      } catch (err) {
        setFileSystemValue(
          'error',
          `Failed to write file at path: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
      }
    },
    [rootHandle, refreshDirectory, setFileSystemValue],
  );

  const readFileAtPath = useCallback(
    async (path: string, root: FileSystemDirectoryHandle | null = rootHandle) => {
      if (!root) throw new Error('No root directory mounted');
      const parts = path.split('/').filter(Boolean);
      let currentHandle = root;
      for (let i = 0; i < parts.length - 1; i++) {
        currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
      }
      const fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1]);
      return await (await fileHandle.getFile()).text();
    },
    [rootHandle],
  );

  const deleteFileAtPath = useCallback(
    async (path: string, root: FileSystemDirectoryHandle | null = rootHandle) => {
      if (!root) throw new Error('No root directory mounted');
      try {
        const parts = path.split('/').filter(Boolean);
        let currentHandle = root;
        for (let i = 0; i < parts.length - 1; i++) {
          currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
        }
        await currentHandle.removeEntry(parts[parts.length - 1], { recursive: true });
        await refreshDirectory(root);
        return true;
      } catch (err) {
        setFileSystemValue(
          'error',
          `Failed to delete file at path: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
      }
    },
    [rootHandle, refreshDirectory, setFileSystemValue],
  );

  const getFileHandleAtPath = useCallback(
    async (path: string, root: FileSystemDirectoryHandle | null = rootHandle) => {
      if (!root) return null;
      try {
        const parts = path.split('/').filter(Boolean);
        let currentHandle = root;
        for (let i = 0; i < parts.length - 1; i++) {
          currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
        }
        return await currentHandle.getFileHandle(parts[parts.length - 1]);
      } catch (_err) {
        return null;
      }
    },
    [rootHandle],
  );

  const createFolder = useCallback(
    async (folderName: string, dirHandle: FileSystemDirectoryHandle | null = currentDirHandle) => {
      if (!dirHandle) throw new Error('No directory mounted');
      try {
        await dirHandle.getDirectoryHandle(folderName, { create: true });
        await refreshDirectory(dirHandle);
      } catch (err) {
        setFileSystemValue(
          'error',
          `Failed to create folder: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [currentDirHandle, refreshDirectory, setFileSystemValue],
  );

  const deleteEntry = useCallback(
    async (name: string, dirHandle: FileSystemDirectoryHandle | null = currentDirHandle) => {
      if (!dirHandle) throw new Error('No directory mounted');
      try {
        await dirHandle.removeEntry(name, { recursive: true });
        await refreshDirectory(dirHandle);
      } catch (err) {
        setFileSystemValue(
          'error',
          `Failed to delete entry: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [currentDirHandle, refreshDirectory, setFileSystemValue],
  );

  const moveEntry = useCallback(
    async (
      sourceHandle: FileSystemHandle,
      destinationDirHandle: FileSystemDirectoryHandle,
      newName: string | null = null,
    ) => {
      if (!sourceHandle || !destinationDirHandle) throw new Error('Source or destination missing');
      try {
        // Use the modern move API if available
        if (sourceHandle.move) {
          await sourceHandle.move(destinationDirHandle, newName || sourceHandle.name);
        } else {
          throw new Error('FileSystemHandle.move is not supported in this environment');
        }
        await refreshDirectory(destinationDirHandle);
        setFileSystemValue('refreshTrigger', (v = 0) => v + 1);
      } catch (err) {
        setFileSystemValue(
          'error',
          `Failed to move entry: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [refreshDirectory, setFileSystemValue],
  );

  const unlinkProject = useCallback(async () => {
    if (!fileSystemState) return;
    try {
      await clearHandle();
      fileSystemState((draft) => {
        draft.rootHandle = null;
        draft.mode = null;
        draft.files = [];
        draft.error = null;
      });
    } catch (err) {
      setFileSystemValue(
        'error',
        `Failed to unlink project: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, [fileSystemState, setFileSystemValue]);

  return useMemo<FileSystemApi>(
    () => ({
      mode,
      files,
      error,
      version,
      currentDirHandle,
      rootHandle,
      mountOPFS,
      mountLocal,
      refreshDirectory,
      triggerRefresh,
      readFile,
      writeFile,
      writeFileAtPath,
      readFileAtPath,
      deleteFileAtPath,
      getFileHandleAtPath,
      createFolder,
      deleteEntry,
      moveEntry,
      unlinkProject,
      isReady,
    }),
    [
      mode,
      files,
      error,
      version,
      currentDirHandle,
      rootHandle,
      mountOPFS,
      mountLocal,
      refreshDirectory,
      triggerRefresh,
      readFile,
      writeFile,
      writeFileAtPath,
      readFileAtPath,
      deleteFileAtPath,
      getFileHandleAtPath,
      createFolder,
      deleteEntry,
      moveEntry,
      unlinkProject,
      isReady,
    ],
  );
}
