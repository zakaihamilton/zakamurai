import type { LargeCache, LargeCacheKey, StorageLayer } from './storage-types';

type WriteGenerations = { [K in LargeCacheKey]: number };

type LargePersistenceDependencies = {
  cache: LargeCache;
  idbKeys: Record<LargeCacheKey, string>;
  writeGenerations: WriteGenerations;
  idbSet: (key: string, value: unknown) => Promise<boolean>;
  clearLegacyLocal: (key: string) => void;
  writeLocalFallback: (key: string, value: string | null) => boolean;
  recordStorageSuccess: (layer: StorageLayer) => Promise<unknown>;
  recordStorageFailure: (message: string) => void;
};

export function serializeLargeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function createLargePersistence({
  cache,
  idbKeys,
  writeGenerations,
  idbSet,
  clearLegacyLocal,
  writeLocalFallback,
  recordStorageSuccess,
  recordStorageFailure,
}: LargePersistenceDependencies) {
  const setValue = <K extends LargeCacheKey>(key: K, value: LargeCache[K]): void => {
    cache[key] = value;
  };

  const write = async <K extends LargeCacheKey>(
    cacheKey: K,
    value: LargeCache[K],
  ): Promise<boolean> => {
    setValue(cacheKey, value);
    const idbKey = idbKeys[cacheKey];
    const myGeneration = ++writeGenerations[cacheKey];
    const durable = await idbSet(idbKey, value);

    // A newer write or unload flush happened — do not clear a fresher snapshot.
    if (myGeneration !== writeGenerations[cacheKey]) return durable;

    if (durable) {
      await recordStorageSuccess('indexeddb');
      clearLegacyLocal(idbKey);
      return true;
    }

    console.warn(`IndexedDB unavailable for ${cacheKey}; trying localStorage fallback`);
    const fallbackSaved = writeLocalFallback(idbKey, serializeLargeValue(value));
    if (fallbackSaved) await recordStorageSuccess('localStorage');
    else recordStorageFailure(`Could not persist ${cacheKey} in IndexedDB or localStorage.`);
    return fallbackSaved;
  };

  const persistSync = <K extends LargeCacheKey>(cacheKey: K, value: LargeCache[K]): boolean => {
    setValue(cacheKey, value);
    // Invalidate in-flight writes so they cannot clear this fresher unload snapshot.
    writeGenerations[cacheKey] += 1;
    const idbKey = idbKeys[cacheKey];
    const ok = writeLocalFallback(idbKey, serializeLargeValue(value));
    // Fire-and-forget durable IDB write; unload may cancel it.
    void idbSet(idbKey, value);
    return ok;
  };

  return { persistSync, setValue, write };
}
