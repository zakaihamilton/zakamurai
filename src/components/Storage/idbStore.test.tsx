import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  idbClear,
  idbDelete,
  idbGet,
  idbSet,
  isIdbAvailable,
  resetIdbConnection,
} from './idbStore';

describe('idbStore', () => {
  beforeEach(() => {
    resetIdbConnection();
  });

  afterEach(async () => {
    await idbClear();
    resetIdbConnection();
  });

  it('round-trips JSON-serializable values when IndexedDB works', async () => {
    if (!isIdbAvailable()) {
      expect(await idbSet('fileContents', { 'a.js': 'x' })).toBe(false);
      return;
    }
    await expect(idbSet('fileContents', { 'a.js': 'console.log(1)' })).resolves.toBe(true);
    expect(await idbGet('fileContents')).toEqual({ 'a.js': 'console.log(1)' });
  });

  it('deletes keys when value is null or via idbDelete', async () => {
    await idbSet('previewHtml', '<html></html>');
    await idbDelete('previewHtml');
    expect(await idbGet('previewHtml')).toBeNull();
  });

  it('clears store and memory fallback', async () => {
    await idbSet('key1', 'val1');
    await idbClear();
    expect(await idbGet('key1')).toBeNull();
  });

  it('returns false (not durable) when IndexedDB is unavailable', async () => {
    const original = globalThis.indexedDB;
    globalThis.indexedDB = undefined as unknown as IDBFactory;
    resetIdbConnection();

    await expect(idbSet('k', { ok: true })).resolves.toBe(false);
    // Same-session memory mirror still readable
    expect(await idbGet('k')).toEqual({ ok: true });

    await idbClear();
    expect(await idbGet('k')).toBeNull();

    globalThis.indexedDB = original;
    resetIdbConnection();
  });

  it('serializes writes to the same key so the latest value wins', async () => {
    const first = idbSet('ordered', { n: 1 });
    const second = idbSet('ordered', { n: 2 });
    await Promise.all([first, second]);
    expect(await idbGet('ordered')).toEqual({ n: 2 });
  });

  it('waits for accepted writes before clearing the store', async () => {
    const originalIndexedDB = globalThis.indexedDB;
    const values = new Map<string, unknown>();
    let releaseFirstWrite: (() => void) | undefined;
    let firstWrite = true;

    const database = {
      objectStoreNames: { contains: () => true },
      transaction: () => {
        const isFirstTransaction = firstWrite;
        const transaction = {
          objectStore: () => ({
            put(value: unknown, key: string) {
              if (isFirstTransaction) {
                firstWrite = false;
                releaseFirstWrite = () => {
                  values.set(key, value);
                  transaction.oncomplete?.();
                };
                return;
              }
              values.set(key, value);
            },
            clear() {
              values.clear();
            },
            get(key: string) {
              const request = {
                result: values.get(key),
                onsuccess: undefined as (() => void) | undefined,
              };
              queueMicrotask(() => request.onsuccess?.());
              return request;
            },
            delete(key: string) {
              values.delete(key);
            },
          }),
          oncomplete: undefined as (() => void) | undefined,
          onerror: undefined as (() => void) | undefined,
          onabort: undefined as (() => void) | undefined,
        };
        if (!isFirstTransaction) queueMicrotask(() => transaction.oncomplete?.());
        return transaction;
      },
    } as unknown as IDBDatabase;

    globalThis.indexedDB = {
      open: () => {
        const request = {
          result: database,
          onsuccess: undefined as (() => void) | undefined,
          onerror: undefined as (() => void) | undefined,
          onupgradeneeded: undefined as (() => void) | undefined,
        };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    } as unknown as IDBFactory;
    resetIdbConnection();

    const write = idbSet('key', 'value');
    for (let attempt = 0; attempt < 5 && !releaseFirstWrite; attempt += 1) {
      await Promise.resolve();
    }
    const clear = idbClear();
    await Promise.resolve();
    expect(values.get('key')).toBeUndefined();

    releaseFirstWrite?.();
    await write;
    await clear;
    expect(await idbGet('key')).toBeNull();

    globalThis.indexedDB = originalIndexedDB;
    resetIdbConnection();
  });
});
