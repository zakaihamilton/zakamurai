/**
 * Returns keys whose values differ between two plain objects (shallow, `Object.is`).
 *
 * @param {Record<string, unknown>} [a]
 * @param {Record<string, unknown>} [b]
 * @returns {string[]}
 */
export function objectChangedKeys(a = {}, b = {}) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) {
    return aKeys;
  }

  return aKeys.filter((key) => !Object.hasOwn(b, key) || !Object.is(a[key], b[key]));
}

/**
 * JSON.stringify replacer that drops functions and breaks circular references on `object`'s keys.
 *
 * @param {Record<string, unknown>} object
 * @returns {(key: string, value: unknown) => unknown}
 */
export function getCircularReplacer(object) {
  if (typeof object !== 'object' || object === null) {
    return object;
  }
  const keysSet = new Set(Object.keys(object));
  const seen = new WeakSet();
  return (key, value) => {
    if (key && !keysSet.has(key)) {
      return;
    }
    if (typeof value === 'function') {
      return;
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
}

/**
 * Creates a callable proxy store: invoke with a draft callback to batch-update, or assign properties directly.
 *
 * @param {Record<string, unknown>} props - Initial state.
 * @param {string} [id] - Optional debug label (`__id`).
 * @returns {object & {
 *   (draft: (draft: Record<string, unknown>) => void): void,
 *   __monitor: (key: string | null, cb: (keys: string[]) => void, id?: string) => void,
 *   __unmonitor: (key: string | null, cb: (keys: string[]) => void) => void
 * }}
 */
export function createObject(props, id) {
  const monitor = new Map();
  let counter = 0;
  let node;
  const unique = crypto.randomUUID();
  const internalState = { ...props };

  const pendingKeys = new Set();
  let isMicrotaskQueued = false;

  const notify = (keys) => {
    if (!Array.isArray(keys) || keys.length === 0) {
      return;
    }

    for (const key of keys) {
      pendingKeys.add(key);
    }

    if (!isMicrotaskQueued) {
      isMicrotaskQueued = true;
      queueMicrotask(() => {
        counter++;
        const flushKeys = Array.from(pendingKeys);

        for (const [cb, item] of monitor.entries()) {
          if (!item.key || flushKeys.includes(item.key)) {
            item.counter++;
            cb(flushKeys);
          }
        }

        pendingKeys.clear();
        isMicrotaskQueued = false;
      });
    }
  };

  const target = () => {};

  const proxy = new Proxy(target, {
    get: (target, propertyKey, receiver) => {
      if (Object.hasOwn(internalState, propertyKey)) {
        return internalState[propertyKey];
      }
      return Reflect.get(target, propertyKey, receiver);
    },
    set: (target, propertyKey, value, receiver) => {
      if (typeof propertyKey === 'string' && propertyKey.startsWith('__')) {
        return Reflect.set(target, propertyKey, value, receiver);
      }

      if (internalState[propertyKey] === value) {
        return true;
      }

      internalState[propertyKey] = value;
      notify([propertyKey]);
      return true;
    },
    deleteProperty: (_, propertyKey) => {
      if (Object.hasOwn(internalState, propertyKey)) {
        delete internalState[propertyKey];
        notify([propertyKey]);
        return true;
      }
      return false;
    },
    apply(_, thisArg, argumentsList) {
      const cb = argumentsList[0];
      if (typeof cb !== 'function') {
        return;
      }

      const draft = { ...internalState };
      cb.call(thisArg, draft);

      const changedKeys = [];
      const untouchedKeys = new Set(Object.keys(internalState));

      for (const key in draft) {
        untouchedKeys.delete(key);
        if (internalState[key] !== draft[key]) {
          internalState[key] = draft[key];
          changedKeys.push(key);
        }
      }

      for (const key of untouchedKeys) {
        delete internalState[key];
        changedKeys.push(key);
      }

      if (changedKeys.length > 0) {
        notify(changedKeys);
      }
    },
    ownKeys: (target) => {
      const stateKeys = Reflect.ownKeys(internalState);
      const targetKeys = Reflect.ownKeys(target);
      return Array.from(new Set([...stateKeys, ...targetKeys]));
    },
    has: (target, propertyKey) => propertyKey in internalState || Reflect.has(target, propertyKey),
    getOwnPropertyDescriptor(target, propertyKey) {
      if (Object.hasOwn(internalState, propertyKey)) {
        return {
          value: internalState[propertyKey],
          writable: true,
          enumerable: true,
          configurable: true,
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, propertyKey);
    },
  });

  Object.defineProperty(proxy, '__monitor', {
    value: (key, cb, id) => {
      monitor.set(cb, { key, cb, id, counter: 0 });
    },
    writable: false,
    enumerable: false,
  });

  Object.defineProperty(proxy, '__unmonitor', {
    value: (_, cb) => {
      monitor.delete(cb);
    },
    writable: false,
    enumerable: false,
  });

  Object.defineProperty(proxy, '__monitored', {
    get: () => Array.from(monitor.values()),
    enumerable: false,
  });

  Object.defineProperty(proxy, '__unique', {
    get: () => unique,
    enumerable: false,
  });

  Object.defineProperty(proxy, '__id', {
    get: () => id,
    enumerable: false,
  });

  Object.defineProperty(proxy, '__object', {
    get: () => internalState,
    enumerable: false,
  });

  Object.defineProperty(proxy, '__counter', {
    get: () => counter,
    enumerable: false,
  });

  Object.defineProperty(proxy, '__string', {
    get: () => {
      return JSON.stringify(internalState, getCircularReplacer(internalState), 2);
    },
    enumerable: false,
  });

  Object.defineProperty(proxy, '__node', {
    get: () => node,
    set: (value) => {
      node = value;
    },
    enumerable: false,
    configurable: true,
  });

  return proxy;
}

/**
 * Splits `obj` into `[picked, rest]` by whether each key is in `keysToFilter`.
 *
 * @param {Record<string, unknown>} obj
 * @param {string[]} keysToFilter
 * @returns {[Record<string, unknown>, Record<string, unknown>]}
 */
export function filterObjectByKeys(obj, keysToFilter) {
  const filtered = {};
  const leftover = {};
  const keysSet = new Set(keysToFilter);

  for (const [key, value] of Object.entries(obj)) {
    const target = keysSet.has(key) ? filtered : leftover;
    target[key] = value;
  }

  return [filtered, leftover];
}
