/**
 * @fileoverview State factory and hooks built on the Node tree and proxy-based Object store.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Node, { nodeGetProperty, nodeSetProperty, subscribeToNode } from './Node';
import { createObject, objectChangedKeys } from './Object';
import type {
  StateMonitorCallback,
  StateScope,
  StateSelector,
  StateStore,
} from './types';

/**
 * Creates a named state scope: a React component plus `useState`, `useFutureState`, and
 * `usePassiveState` hooks bound to a shared proxy object in the Node tree.
 */
export function createState<T extends object>(displayName: string): StateScope<T> {
  function State({ children, ...props }: React.ComponentProps<StateScope<T>>) {
    const object = State.useState(null, props as Partial<T>);
    const prevPropsRef = useRef<Record<string, unknown>>({});

    useEffect(() => {
      if (!object) return;
      const keysChanged = objectChangedKeys(props as Record<string, unknown>, prevPropsRef.current);
      if (keysChanged && keysChanged.length > 0) {
        prevPropsRef.current = props as Record<string, unknown>;
        object((draft) => {
          for (const key of keysChanged) {
            (draft as Record<string, unknown>)[key] = (props as Record<string, unknown>)[key];
          }
        });
      }
      // biome-ignore lint/correctness/useExhaustiveDependencies: Handled by objectChangedKeys
    }, [object, props]);

    if (!children) {
      return null;
    }

    if (typeof children === 'function') {
      return children(object);
    }

    return <Node id={displayName}>{children}</Node>;
  }

  State.useState = (selector?: StateSelector<T>, initial?: Partial<T>, id?: string) => {
    let node = Node.useNode(initial ? null : State);
    const current = Node.useNode();
    if (!node) {
      node = current;
    }
    let object = nodeGetProperty(node, State) as StateStore<T> | undefined;
    if (!object && node) {
      object = createObject({ ...(initial || {}) } as T, displayName);
      nodeSetProperty(node, State, object);
      object.__node = node;
    }

    if (object && initial && Object.keys(object).length === 0) {
      queueMicrotask(() => {
        if (Object.keys(object as object).length === 0) {
          Object.assign(object, initial);
        }
      });
    }

    useObjectState(object, selector, id);
    return object;
  };

  State.useFutureState = (selector?: StateSelector<T>, id?: string) => {
    const startNode = Node.useNode();
    const existingNode = Node.useNode(State);
    const foundObject = useRef(nodeGetProperty(existingNode, State) as StateStore<T> | undefined);

    const [object, setObject] = useState<StateStore<T> | undefined>(foundObject.current);

    useEffect(() => {
      let currentSearch: ReturnType<typeof Node.useNode> | null = startNode;
      while (currentSearch) {
        const checkObj = nodeGetProperty(currentSearch, State) as StateStore<T> | undefined;
        if (checkObj) {
          foundObject.current = checkObj;
          setObject(checkObj);
          return;
        }
        currentSearch = currentSearch.parent;
      }

      if (object || foundObject.current) return;

      const unsubscribes: Array<() => void> = [];
      let search: ReturnType<typeof Node.useNode> | null = startNode;

      const handleEvent = (_changedNode: unknown, propId: unknown, newValue: unknown) => {
        if (propId !== State) return;
        foundObject.current = newValue as StateStore<T>;
        setObject(newValue as StateStore<T>);
      };

      while (search) {
        unsubscribes.push(subscribeToNode(search, handleEvent));
        search = search.parent;
      }

      return () => {
        for (const unsub of unsubscribes) {
          unsub();
        }
      };
    }, [startNode, object]);

    const activeObject = object || foundObject.current;
    return useObjectState(activeObject, selector, id);
  };

  State.usePassiveState = () => {
    const node = Node.useNode(State);
    const object = nodeGetProperty(node, State) as StateStore<T> | undefined;
    return object;
  };

  State.displayName = displayName;
  return State as StateScope<T>;
}

/**
 * Returns whether a state change notification should fire for `key` given `selector`.
 */
export function isSelectorMatch<T extends object>(
  selector: StateSelector<T>,
  key: string,
): boolean | undefined {
  if (selector === undefined) {
    return true;
  }
  if (!selector) {
    return false;
  }

  const selectorType = typeof selector;
  if (selectorType === 'string') {
    return selector === key;
  }
  if (selectorType === 'function') {
    return !!(selector as (key: string) => boolean)(key);
  }
  if (selectorType === 'object') {
    return Array.isArray(selector)
      ? (selector as string[]).includes(key)
      : ((selector as Record<string, unknown>)[key] as boolean | undefined);
  }

  return true;
}

/**
 * Subscribes `handler` to all changes on `object`; invokes once immediately with `null`.
 */
export function useObjectHandler<T extends object>(
  object: StateStore<T> | null | undefined,
  handler: StateMonitorCallback | null | undefined,
  id?: string,
): StateStore<T> | null | undefined {
  useEffect(() => {
    if (!object || !handler || !object.__monitor || !object.__unmonitor) {
      return;
    }
    object.__monitor(null, handler, id);
    handler(null);
    return () => {
      object.__unmonitor(null, handler, id);
    };
  }, [object, handler, id]);
  return object;
}

/**
 * Subscribes a React component to `object` via `useSyncExternalStore`, optionally filtered by `selector`.
 */
export function useObjectState<T extends object>(
  object: StateStore<T> | null | undefined,
  selector?: StateSelector<T>,
  id?: string,
): StateStore<T> | null | undefined {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!object) return () => {};

      if (typeof object.__monitor !== 'function') {
        return () => {};
      }

      const handler = (keys: string[] | null) => {
        if (!selector || keys?.some((key) => isSelectorMatch(selector, key))) {
          onStoreChange();
        }
      };

      object.__monitor(null, handler, id);

      return () => {
        if (typeof object.__unmonitor === 'function') {
          object.__unmonitor(null, handler, id);
        }
      };
    },
    [object, selector, id],
  );

  const getSnapshot = useCallback(() => {
    if (!object) return null;

    if (typeof object.__counter === 'undefined') {
      return typeof selector === 'string' ? object[selector as keyof T] : object;
    }

    if (typeof selector === 'string') {
      return object[selector as keyof T];
    }

    return object.__counter;
  }, [object, selector]);

  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return object;
}
