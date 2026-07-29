import type { Draft, StateMonitorCallback, StateNode, StateStore } from './types';

/**
 * Returns keys whose values differ between two plain objects (shallow, `Object.is`).
 */
export function objectChangedKeys(
  a: Record<string, unknown> = {},
  b: Record<string, unknown> = {},
): string[] {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) {
    return aKeys;
  }

  return aKeys.filter((key) => !Object.hasOwn(b, key) || !Object.is(a[key], b[key]));
}

/**
 * JSON.stringify replacer that drops functions and breaks circular references on `object`'s keys.
 */
export function getCircularReplacer(object: Record<string, unknown>) {
  const keysSet = new Set(Object.keys(object));
  const seen = new WeakSet<object>();
  return (key: string, value: unknown): unknown => {
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

interface MonitorEntry {
  key: string | null;
  cb: StateMonitorCallback;
  id?: string;
  counter: number;
}

/**
 * Creates a callable proxy store: invoke with a draft callback to batch-update, or assign properties directly.
 */
export function createObject<T extends object>(props: T, id?: string): StateStore<T> {
  const monitor = new Map<StateMonitorCallback, MonitorEntry>();
  let counter = 0;
  let node: StateNode | undefined;
  const unique = crypto.randomUUID();
  const internalState = { ...props } as T;

  const pendingKeys = new Set<string>();
  let isMicrotaskQueued = false;

  const notify = (keys: string[]) => {
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

        for (const [, item] of monitor.entries()) {
          if (!item.key || flushKeys.includes(item.key)) {
            item.counter++;
            item.cb(flushKeys);
          }
        }

        pendingKeys.clear();
        isMicrotaskQueued = false;
      });
    }
  };

  const target = () => {};

  const proxy = new Proxy(target, {
    get: (_target, propertyKey, receiver) => {
      if (typeof propertyKey === 'string' && Object.hasOwn(internalState, propertyKey)) {
        return internalState[propertyKey as keyof T];
      }
      return Reflect.get(target, propertyKey, receiver);
    },
    set: (_target, propertyKey, value, receiver) => {
      if (typeof propertyKey === 'string' && propertyKey.startsWith('__')) {
        return Reflect.set(target, propertyKey, value, receiver);
      }

      if (typeof propertyKey !== 'string') {
        return false;
      }

      if (internalState[propertyKey as keyof T] === value) {
        return true;
      }

      (internalState as Record<string, unknown>)[propertyKey] = value;
      notify([propertyKey]);
      return true;
    },
    deleteProperty: (_target, propertyKey) => {
      if (typeof propertyKey === 'string' && Object.hasOwn(internalState, propertyKey)) {
        delete (internalState as Record<string, unknown>)[propertyKey];
        notify([propertyKey]);
        return true;
      }
      return false;
    },
    apply(_target, thisArg, argumentsList) {
      const cb = argumentsList[0];
      if (typeof cb !== 'function') {
        return;
      }

      const draft = { ...internalState } as Draft<T>;
      cb.call(thisArg, draft);

      const changedKeys: string[] = [];
      const untouchedKeys = new Set(Object.keys(internalState));

      for (const key in draft as Record<string, unknown>) {
        untouchedKeys.delete(key);
        if ((internalState as Record<string, unknown>)[key] !== (draft as Record<string, unknown>)[key]) {
          (internalState as Record<string, unknown>)[key] = (draft as Record<string, unknown>)[key];
          changedKeys.push(key);
        }
      }

      for (const key of untouchedKeys) {
        delete (internalState as Record<string, unknown>)[key];
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
    has: (target, propertyKey) =>
      (typeof propertyKey === 'string' && propertyKey in internalState) ||
      Reflect.has(target, propertyKey),
    getOwnPropertyDescriptor(target, propertyKey) {
      if (typeof propertyKey === 'string' && Object.hasOwn(internalState, propertyKey)) {
        return {
          value: internalState[propertyKey as keyof T],
          writable: true,
          enumerable: true,
          configurable: true,
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, propertyKey);
    },
  }) as StateStore<T>;

  Object.defineProperty(proxy, '__monitor', {
    value: (key: string | null, cb: StateMonitorCallback, monitorId?: string) => {
      monitor.set(cb, { key, cb, id: monitorId, counter: 0 });
    },
    writable: false,
    enumerable: false,
  });

  Object.defineProperty(proxy, '__unmonitor', {
    value: (_key: string | null, cb: StateMonitorCallback) => {
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
      return JSON.stringify(internalState, getCircularReplacer(internalState as Record<string, unknown>), 2);
    },
    enumerable: false,
  });

  Object.defineProperty(proxy, '__node', {
    get: () => node,
    set: (value: StateNode | undefined) => {
      node = value;
    },
    enumerable: false,
    configurable: true,
  });

  return proxy;
}

/**
 * Splits `obj` into `[picked, rest]` by whether each key is in `keysToFilter`.
 */
export function filterObjectByKeys<T extends Record<string, unknown>>(
  obj: T,
  keysToFilter: string[],
): [Partial<T>, Partial<T>] {
  const filtered: Partial<T> = {};
  const leftover: Partial<T> = {};
  const keysSet = new Set(keysToFilter);

  for (const [key, value] of Object.entries(obj)) {
    const target = keysSet.has(key) ? filtered : leftover;
    (target as Record<string, unknown>)[key] = value;
  }

  return [filtered, leftover];
}
