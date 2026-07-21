import { createState } from '@/components/state/State';
import { useCallback, useEffect, useMemo } from 'react';

const DB_NAME = 'ZakamuraiFS';
const STORE_NAME = 'handles';
const FS_INIT_TIMEOUT_MS = 3000;
export const FileSystemState = createState('FileSystemState');

function withTimeout(promise, message, timeoutMs = FS_INIT_TIMEOUT_MS) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

async function getDB() {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandle(handle) {
  const db = await getDB();
  if (!db) return;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(handle, 'root');
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandle() {
  const db = await getDB();
  if (!db) return null;
  const tx = db.transaction(STORE_NAME, 'readonly');
  const request = tx.objectStore(STORE_NAME).get('root');
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearHandle() {
  const db = await getDB();
  if (!db) return;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete('root');
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function useFileSystem() {
  const fileSystemState = FileSystemState.useState(null, {
    rootHandle: null,
    currentDirHandle: null,
    files: [],
    mode: null,
    error: null,
    version: 0,
    refreshTrigger: 0,
    isReady: false,
  });
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
    (key, nextValue) => {
      fileSystemState((draft) => {
        draft[key] = typeof nextValue === 'function' ? nextValue(draft[key]) : nextValue;
      });
    },
    [fileSystemState],
  );

  const triggerRefresh = useCallback(() => {
    setFileSystemValue('refreshTrigger', (v = 0) => v + 1);
  }, [setFileSystemValue]);

  // 1. Wrapped in useCallback so it can be safely used as a dependency
  const refreshDirectory = useCallback(
    async (dirHandle, updateSidebar = true) => {
      try {
        const entries = [];
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
            draft.files = entries;
            draft.currentDirHandle = dirHandle;
          });
        }
        fileSystemState((draft) => {
          draft.version = (draft.version || 0) + 1;
          draft.error = null;
        });
        return entries;
      } catch (err) {
        setFileSystemValue('error', `Failed to read directory: ${err.message}`);
      }
    },
    [fileSystemState, setFileSystemValue],
  );

  const mountOPFS = useCallback(async () => {
    try {
      const handle = await navigator.storage.getDirectory();
      fileSystemState((draft) => {
        draft.rootHandle = handle;
        draft.mode = 'opfs';
      });
      await refreshDirectory(handle);
    } catch (err) {
      setFileSystemValue('error', `Failed to mount OPFS: ${err.message}`);
    }
  }, [fileSystemState, refreshDirectory, setFileSystemValue]); // Added missing dependency

  const mountLocal = useCallback(async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      fileSystemState((draft) => {
        draft.rootHandle = handle;
        draft.mode = 'local';
      });
      await saveHandle(handle);
      await refreshDirectory(handle);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setFileSystemValue('error', `Failed to mount local FS: ${err.message}`);
      }
    }
  }, [fileSystemState, refreshDirectory, setFileSystemValue]);

  useEffect(() => {
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
  }, [fileSystemState, refreshDirectory, setFileSystemValue]);

  // Handle manual refreshes via trigger
  useEffect(() => {
    if (rootHandle && mode && refreshTrigger > 0) {
      refreshDirectory(rootHandle);
    }
  }, [refreshTrigger, rootHandle, mode, refreshDirectory]);

  const readFile = useCallback(async (fileHandle) => {
    const file = await fileHandle.getFile();
    return await file.text();
  }, []);

  // Wrapped in useCallback with currentDirHandle and refreshDirectory as deps
  const writeFile = useCallback(
    async (filename, content, dirHandle = currentDirHandle) => {
      if (!dirHandle) throw new Error('No directory mounted');
      try {
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        await refreshDirectory(dirHandle);
      } catch (err) {
        setFileSystemValue('error', `Failed to write file: ${err.message}`);
      }
    },
    [currentDirHandle, refreshDirectory, setFileSystemValue],
  );

  const writeFileAtPath = useCallback(
    async (path, content, root = rootHandle) => {
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
      } catch (err) {
        setFileSystemValue('error', `Failed to write file at path: ${err.message}`);
      }
    },
    [rootHandle, refreshDirectory, setFileSystemValue],
  );

  const deleteFileAtPath = useCallback(
    async (path, root = rootHandle) => {
      if (!root) throw new Error('No root directory mounted');
      try {
        const parts = path.split('/').filter(Boolean);
        let currentHandle = root;
        for (let i = 0; i < parts.length - 1; i++) {
          currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
        }
        await currentHandle.removeEntry(parts[parts.length - 1], { recursive: true });
        await refreshDirectory(root);
      } catch (err) {
        setFileSystemValue('error', `Failed to delete file at path: ${err.message}`);
      }
    },
    [rootHandle, refreshDirectory, setFileSystemValue],
  );

  const getFileHandleAtPath = useCallback(
    async (path, root = rootHandle) => {
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
    async (folderName, dirHandle = currentDirHandle) => {
      if (!dirHandle) throw new Error('No directory mounted');
      try {
        await dirHandle.getDirectoryHandle(folderName, { create: true });
        await refreshDirectory(dirHandle);
      } catch (err) {
        setFileSystemValue('error', `Failed to create folder: ${err.message}`);
      }
    },
    [currentDirHandle, refreshDirectory, setFileSystemValue],
  );

  const deleteEntry = useCallback(
    async (name, dirHandle = currentDirHandle) => {
      if (!dirHandle) throw new Error('No directory mounted');
      try {
        await dirHandle.removeEntry(name, { recursive: true });
        await refreshDirectory(dirHandle);
      } catch (err) {
        setFileSystemValue('error', `Failed to delete entry: ${err.message}`);
      }
    },
    [currentDirHandle, refreshDirectory, setFileSystemValue],
  );

  const moveEntry = useCallback(
    async (sourceHandle, destinationDirHandle, newName = null) => {
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
        setFileSystemValue('error', `Failed to move entry: ${err.message}`);
      }
    },
    [refreshDirectory, setFileSystemValue],
  );

  const unlinkProject = useCallback(async () => {
    try {
      await clearHandle();
      fileSystemState((draft) => {
        draft.rootHandle = null;
        draft.mode = null;
        draft.files = [];
        draft.error = null;
      });
    } catch (err) {
      setFileSystemValue('error', `Failed to unlink project: ${err.message}`);
    }
  }, [fileSystemState, setFileSystemValue]);

  return useMemo(
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
