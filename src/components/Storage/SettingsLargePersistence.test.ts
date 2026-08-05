import { describe, expect, it, vi } from 'vitest';
import { createLargePersistence } from './SettingsLargePersistence';

function createCache() {
  return {
    fileContents: null,
    pendingDiffs: {},
    pendingDeletions: null,
    previewHtml: null,
    agentSessions: null,
    aiLogs: [],
    changeSets: { activeId: null, items: [] },
  };
}

describe('large settings persistence', () => {
  it('fences a completed stale write from clearing a newer local snapshot', async () => {
    const cache = createCache();
    const generations = {
      fileContents: 0,
      pendingDiffs: 0,
      pendingDeletions: 0,
      previewHtml: 0,
      agentSessions: 0,
      aiLogs: 0,
      changeSets: 0,
    };
    let resolveWrite: ((value: boolean) => void) | undefined;
    let callCount = 0;
    const idbSet = vi.fn(() =>
      callCount++ === 0
        ? new Promise<boolean>((resolve) => {
            resolveWrite = resolve;
          })
        : Promise.resolve(true),
    );
    const localValues = new Map<string, string | null>();
    const persistence = createLargePersistence({
      cache,
      idbKeys: { fileContents: 'file-contents' } as never,
      writeGenerations: generations,
      idbSet,
      clearLegacyLocal: (key) => localValues.delete(key),
      writeLocalFallback: (key, value) => {
        localValues.set(key, value);
        return true;
      },
      recordStorageSuccess: vi.fn(async () => undefined),
      recordStorageFailure: vi.fn(),
    });

    const staleWrite = persistence.write('fileContents', { stale: 'true' });
    persistence.persistSync('fileContents', { fresh: 'true' });
    resolveWrite?.(true);
    await staleWrite;

    expect(cache.fileContents).toEqual({ fresh: 'true' });
    expect(localValues.get('file-contents')).toBe(JSON.stringify({ fresh: 'true' }));
  });

  it('invalidates writes that were already in flight when a project reset starts', async () => {
    const cache = createCache();
    const generations = {
      fileContents: 0,
      pendingDiffs: 0,
      pendingDeletions: 0,
      previewHtml: 0,
      agentSessions: 0,
      aiLogs: 0,
      changeSets: 0,
    };
    let resolveWrite: ((value: boolean) => void) | undefined;
    const localValues = new Map<string, string | null>();
    const persistence = createLargePersistence({
      cache,
      idbKeys: { fileContents: 'file-contents' } as never,
      writeGenerations: generations,
      idbSet: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            resolveWrite = resolve;
          }),
      ),
      clearLegacyLocal: (key) => localValues.delete(key),
      writeLocalFallback: (key, value) => {
        localValues.set(key, value);
        return true;
      },
      recordStorageSuccess: vi.fn(async () => undefined),
      recordStorageFailure: vi.fn(),
    });

    const staleWrite = persistence.write('fileContents', { stale: 'true' });
    persistence.invalidateWrites();
    resolveWrite?.(false);

    await expect(staleWrite).resolves.toBe(false);
    expect(localValues).toEqual(new Map());
  });

  it('falls back to serialized localStorage when IndexedDB fails', async () => {
    const cache = createCache();
    const localValues = new Map<string, string | null>();
    const persistence = createLargePersistence({
      cache,
      idbKeys: { fileContents: 'file-contents' } as never,
      writeGenerations: {
        fileContents: 0,
        pendingDiffs: 0,
        pendingDeletions: 0,
        previewHtml: 0,
        agentSessions: 0,
        aiLogs: 0,
        changeSets: 0,
      },
      idbSet: vi.fn(async () => false),
      clearLegacyLocal: (key) => localValues.delete(key),
      writeLocalFallback: (key, value) => {
        localValues.set(key, value);
        return true;
      },
      recordStorageSuccess: vi.fn(async () => undefined),
      recordStorageFailure: vi.fn(),
    });

    await expect(persistence.write('fileContents', { 'a.js': 'code' })).resolves.toBe(true);
    expect(localValues.get('file-contents')).toBe(JSON.stringify({ 'a.js': 'code' }));
  });
});
