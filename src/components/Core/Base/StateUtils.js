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
