/**
 * Minimal IndexedDB key-value store for large project blobs.
 * Falls back to an in-memory Map when IndexedDB is unavailable (SSR / private mode / tests).
 */

const DB_NAME = 'zakamurai-project';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;
const memoryStore = new Map();

function openDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }
  return dbPromise;
}

export async function idbGet(key) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  }
}

export async function idbSet(key, value) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (value === null || value === undefined) {
        store.delete(key);
      } else {
        store.put(value, key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  } catch {
    if (value === null || value === undefined) {
      memoryStore.delete(key);
    } else {
      memoryStore.set(key, value);
    }
  }
  return true;
}

export async function idbDelete(key) {
  return idbSet(key, null);
}

export async function idbClear() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // fall through to memory clear
  }
  memoryStore.clear();
  return true;
}

export function resetIdbConnection() {
  dbPromise = null;
  memoryStore.clear();
}
