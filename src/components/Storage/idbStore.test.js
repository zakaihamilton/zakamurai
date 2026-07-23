import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { idbClear, idbGet, idbSet, resetIdbConnection } from './idbStore';

describe('idbStore', () => {
  beforeEach(() => {
    resetIdbConnection();
  });

  afterEach(async () => {
    await idbClear();
    resetIdbConnection();
  });

  it('round-trips JSON-serializable values (IndexedDB or memory fallback)', async () => {
    await idbSet('fileContents', { 'a.js': 'console.log(1)' });
    expect(await idbGet('fileContents')).toEqual({ 'a.js': 'console.log(1)' });
  });

  it('deletes keys when value is null', async () => {
    await idbSet('previewHtml', '<html></html>');
    await idbSet('previewHtml', null);
    expect(await idbGet('previewHtml')).toBeNull();
  });

  it('uses memory fallback when IndexedDB is unavailable', async () => {
    const original = globalThis.indexedDB;
    globalThis.indexedDB = undefined;
    resetIdbConnection();

    await idbSet('k', { ok: true });
    expect(await idbGet('k')).toEqual({ ok: true });

    globalThis.indexedDB = original;
    resetIdbConnection();
  });
});
