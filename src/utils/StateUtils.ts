/**
 * Utilities for working with the custom Proxy-based state management system.
 */
import type { Draft } from '@/components/state/types';

/**
 * Safely updates a nested value in a state draft, ensuring that all ancestor
 * objects are shallow-copied to trigger the Proxy's change detection.
 */
export function setInDraft<T extends object>(
  draft: Draft<T>,
  path: string[] | null | undefined,
  value: unknown,
): void {
  if (!path || path.length === 0) return;

  let current: Record<string, unknown> = draft as Record<string, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    current[key] = { ...(current[key] as Record<string, unknown>) };
    current = current[key] as Record<string, unknown>;
  }

  current[path[path.length - 1]] = value;
}

/**
 * Updates a value in a draft using a producer function.
 * Ensures the parent object is shallow-copied.
 */
export function updateInDraft<T extends object, V = unknown>(
  draft: Draft<T>,
  path: string[] | null | undefined,
  producer: (currentValue: V) => V,
): void {
  if (!path || path.length === 0) return;

  let current: Record<string, unknown> = draft as Record<string, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    current[key] = { ...(current[key] as Record<string, unknown>) };
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = path[path.length - 1];
  current[lastKey] = producer(current[lastKey] as V);
}

/**
 * Deletes a key from a nested map in a draft, shallow-copying ancestors so the Proxy notifies.
 */
export function deleteInDraft<T extends object>(
  draft: Draft<T>,
  mapPath: string[],
  key: string,
): void {
  if (!mapPath || mapPath.length === 0) return;
  updateInDraft(draft, mapPath, (map: Record<string, unknown> | undefined) => {
    const next = { ...(map && typeof map === 'object' ? map : {}) };
    delete next[key];
    return next;
  });
}

/**
 * Remaps keys in one or more path-keyed maps on a draft when a file/folder is renamed.
 */
export function remapKeysInDraft<T extends object>(
  draft: Draft<T>,
  mapNames: string[],
  oldPrefix: string,
  newPrefix: string,
): void {
  const draftRecord = draft as Record<string, Record<string, unknown>>;
  for (const mapName of mapNames) {
    if (!draftRecord[mapName] || typeof draftRecord[mapName] !== 'object') continue;
    const next: Record<string, unknown> = {};
    for (const key in draftRecord[mapName]) {
      const remapped =
        key === oldPrefix || key.startsWith(`${oldPrefix}/`)
          ? newPrefix + key.substring(oldPrefix.length)
          : key;
      next[remapped] = draftRecord[mapName][key];
    }
    draftRecord[mapName] = next;
  }
}

/**
 * Deletes all keys in path-keyed maps that match a path or its descendants.
 */
export function deleteKeysWithPrefixInDraft<T extends object>(
  draft: Draft<T>,
  mapNames: string[],
  pathPrefix: string,
): void {
  const draftRecord = draft as Record<string, Record<string, unknown>>;
  for (const mapName of mapNames) {
    if (!draftRecord[mapName] || typeof draftRecord[mapName] !== 'object') continue;
    const next: Record<string, unknown> = {};
    for (const key in draftRecord[mapName]) {
      if (key === pathPrefix || key.startsWith(`${pathPrefix}/`)) continue;
      next[key] = draftRecord[mapName][key];
    }
    draftRecord[mapName] = next;
  }
}
