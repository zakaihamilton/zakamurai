import { useState, useCallback, useEffect } from 'react';

const DB_NAME = 'ZakamuraiFS';
const STORE_NAME = 'handles';

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

export function useFileSystem() {
  const [rootHandle, setRootHandle] = useState(null);
  const [currentDirHandle, setCurrentDirHandle] = useState(null);
  const [files, setFiles] = useState([]);
  const [mode, setMode] = useState(null);
  const [error, setError] = useState(null);

  // 1. Wrapped in useCallback so it can be safely used as a dependency
  const refreshDirectory = useCallback(async (dirHandle) => {
    try {
      const entries = [];
      for await (const [name, handle] of dirHandle.entries()) {
        entries.push({ name, kind: handle.kind, handle });
      }

      entries.sort((a, b) => {
        if (a.kind === b.kind) return a.name.localeCompare(b.name);
        return a.kind === 'directory' ? -1 : 1;
      });

      setFiles(entries);
      setCurrentDirHandle(dirHandle);
      setError(null);
    } catch (err) {
      setError(`Failed to read directory: ${err.message}`);
    }
  }, []);

  const mountOPFS = useCallback(async () => {
    try {
      const handle = await navigator.storage.getDirectory();
      setRootHandle(handle);
      setMode('opfs');
      await refreshDirectory(handle);
    } catch (err) {
      setError(`Failed to mount OPFS: ${err.message}`);
    }
  }, [refreshDirectory]); // Added missing dependency

  const mountLocal = useCallback(async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setRootHandle(handle);
      setMode('local');
      await saveHandle(handle);
      await refreshDirectory(handle);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(`Failed to mount local FS: ${err.message}`);
      }
    }
  }, [refreshDirectory]);

  useEffect(() => {
    const init = async () => {
      try {
        const handle = await loadHandle();
        if (handle) {
          // Verify permission
          const status = await handle.queryPermission({ mode: 'readwrite' });
          if (status === 'granted') {
            setRootHandle(handle);
            setMode('local');
            await refreshDirectory(handle);
          }
        }
      } catch (err) {
        console.error('Failed to restore FS handle:', err);
      }
    };
    init();
  }, [refreshDirectory]);

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
        setError(`Failed to write file: ${err.message}`);
      }
    },
    [currentDirHandle, refreshDirectory],
  );

  const createFolder = useCallback(
    async (folderName, dirHandle = currentDirHandle) => {
      if (!dirHandle) throw new Error('No directory mounted');
      try {
        await dirHandle.getDirectoryHandle(folderName, { create: true });
        await refreshDirectory(dirHandle);
      } catch (err) {
        setError(`Failed to create folder: ${err.message}`);
      }
    },
    [currentDirHandle, refreshDirectory],
  );

  const deleteEntry = useCallback(
    async (name, dirHandle = currentDirHandle) => {
      if (!dirHandle) throw new Error('No directory mounted');
      try {
        await dirHandle.removeEntry(name, { recursive: true });
        await refreshDirectory(dirHandle);
      } catch (err) {
        setError(`Failed to delete entry: ${err.message}`);
      }
    },
    [currentDirHandle, refreshDirectory],
  );

  return {
    mode,
    files,
    error,
    currentDirHandle,
    rootHandle,
    mountOPFS,
    mountLocal,
    refreshDirectory,
    readFile,
    writeFile,
    createFolder,
    deleteEntry,
  };
}
