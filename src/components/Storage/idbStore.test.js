import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { idbClear, idbGet, idbSet, isIdbAvailable, resetIdbConnection } from './idbStore';

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

  it('deletes keys when value is null', async () => {
    if (!isIdbAvailable()) {
      expect(await idbSet('previewHtml', '<html></html>')).toBe(false);
      return;
    }
    await idbSet('previewHtml', '<html></html>');
    await idbSet('previewHtml', null);
    expect(await idbGet('previewHtml')).toBeNull();
  });

  it('returns false (not durable) when IndexedDB is unavailable', async () => {
    const original = globalThis.indexedDB;
    globalThis.indexedDB = undefined;
    resetIdbConnection();

    await expect(idbSet('k', { ok: true })).resolves.toBe(false);
    // Same-session memory mirror still readable
    expect(await idbGet('k')).toEqual({ ok: true });

    globalThis.indexedDB = original;
    resetIdbConnection();
  });
});
