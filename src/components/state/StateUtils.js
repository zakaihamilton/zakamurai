/**
 * Utilities for working with the custom Proxy-based state management system.
 */

/**
 * Safely updates a nested value in a state draft, ensuring that all ancestor
 * objects are shallow-copied to trigger the Proxy's change detection.
 *
 * @param {Object} draft - The mutable draft from the state store callback.
 * @param {string[]} path - The path to the property to update (e.g., ['fileContents', 'src/App.js']).
 * @param {any} value - The new value to set.
 */
export function setInDraft(draft, path, value) {
  if (!path || path.length === 0) return;

  let current = draft;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    // Shallow copy the intermediate object to trigger observers
    current[key] = { ...current[key] };
    current = current[key];
  }

  current[path[path.length - 1]] = value;
}

/**
 * Updates a value in a draft using a producer function.
 * Ensures the parent object is shallow-copied.
 *
 * @param {Object} draft - The mutable draft.
 * @param {string[]} path - The path to the property to update.
 * @param {Function} producer - (currentValue) => newValue
 */
export function updateInDraft(draft, path, producer) {
  if (!path || path.length === 0) return;

  let current = draft;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    current[key] = { ...current[key] };
    current = current[key];
  }

  const lastKey = path[path.length - 1];
  current[lastKey] = producer(current[lastKey]);
}

/**
 * Deletes a key from a nested map in a draft, shallow-copying ancestors so the Proxy notifies.
 *
 * @param {Object} draft
 * @param {string[]} mapPath - Path to the map object (e.g. ['fileContents'] or ['pendingDiffs']).
 * @param {string} key - Key to remove from that map.
 */
export function deleteInDraft(draft, mapPath, key) {
  if (!mapPath || mapPath.length === 0) return;
  updateInDraft(draft, mapPath, (map = {}) => {
    const next = { ...map };
    delete next[key];
    return next;
  });
}

/**
 * Remaps keys in one or more path-keyed maps on a draft when a file/folder is renamed.
 * Keys that equal oldPrefix or start with oldPrefix/ are rewritten with newPrefix.
 *
 * @param {Object} draft
 * @param {string[]} mapNames - Top-level draft keys that hold path-keyed maps.
 * @param {string} oldPrefix
 * @param {string} newPrefix
 */
export function remapKeysInDraft(draft, mapNames, oldPrefix, newPrefix) {
  for (const mapName of mapNames) {
    if (!draft[mapName] || typeof draft[mapName] !== 'object') continue;
    const next = {};
    for (const key in draft[mapName]) {
      const remapped =
        key === oldPrefix || key.startsWith(`${oldPrefix}/`)
          ? newPrefix + key.substring(oldPrefix.length)
          : key;
      next[remapped] = draft[mapName][key];
    }
    draft[mapName] = next;
  }
}

/**
 * Deletes all keys in path-keyed maps that match a path or its descendants.
 *
 * @param {Object} draft
 * @param {string[]} mapNames
 * @param {string} pathPrefix
 */
export function deleteKeysWithPrefixInDraft(draft, mapNames, pathPrefix) {
  for (const mapName of mapNames) {
    if (!draft[mapName] || typeof draft[mapName] !== 'object') continue;
    const next = {};
    for (const key in draft[mapName]) {
      if (key === pathPrefix || key.startsWith(`${pathPrefix}/`)) continue;
      next[key] = draft[mapName][key];
    }
    draft[mapName] = next;
  }
}
