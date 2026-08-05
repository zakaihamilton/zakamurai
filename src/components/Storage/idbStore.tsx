/**
 * Minimal IndexedDB key-value store for large project blobs.
 * Uses an in-memory Map as a same-session cache when IndexedDB is unavailable.
 * Returns durable success only when IndexedDB accepts the write; callers may
 * fall back to localStorage themselves.
 */

const DB_NAME = 'zakamurai-project';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;
const memoryStore = new Map<string, unknown>();
const writeQueues = new Map<string, Promise<void>>();
const pendingWrites = new Set<Promise<boolean>>();
let clearBarrier: Promise<void> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
    }).catch((err) => {
      // Allow a later open attempt after a failed first open.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function mirrorMemory(key: string, value: unknown): void {
  if (value === null || value === undefined) {
    memoryStore.delete(key);
  } else {
    memoryStore.set(key, value);
  }
}

export async function idbGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result === undefined ? null : (req.result as T));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return memoryStore.has(key) ? (memoryStore.get(key) as T) : null;
  }
}

/**
 * Persist a value. Returns true only when IndexedDB accepted the write.
 * On failure, mirrors into memory for same-session reads and returns false
 * so callers can fall back to a durable store (e.g. localStorage).
 * Writes to the same key are serialized so older puts cannot commit after newer ones.
 */
export async function idbSet(key: string, value: unknown): Promise<boolean> {
  if (clearBarrier) await clearBarrier;

  const write = persistValue(key, value);
  pendingWrites.add(write);
  try {
    return await write;
  } finally {
    pendingWrites.delete(write);
  }
}

async function persistValue(key: string, value: unknown): Promise<boolean> {
  const previous = writeQueues.get(key) || Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => {}).then(() => gate);
  writeQueues.set(key, queued);

  try {
    await previous.catch(() => {});
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
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
      mirrorMemory(key, value);
      return true;
    } catch {
      mirrorMemory(key, value);
      return false;
    }
  } finally {
    release();
    if (writeQueues.get(key) === queued) {
      writeQueues.delete(key);
    }
  }
}

export async function idbDelete(key: string): Promise<boolean> {
  return idbSet(key, null);
}

export async function idbClear(): Promise<boolean> {
  if (clearBarrier) {
    await clearBarrier;
    return true;
  }

  const clearOperation = (async () => {
    // Finish every write that was already accepted before the clear. New writes
    // wait on clearBarrier, so none can commit between this wait and the clear.
    await Promise.all([...pendingWrites].map((write) => write.catch(() => false)));
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // fall through to memory clear
    }
    memoryStore.clear();
  })();

  clearBarrier = clearOperation.finally(() => {
    clearBarrier = null;
  });
  await clearBarrier;
  return true;
}

export function resetIdbConnection(): void {
  dbPromise = null;
  memoryStore.clear();
  writeQueues.clear();
}

export function isIdbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}
