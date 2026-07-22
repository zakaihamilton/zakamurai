/**
 * @fileoverview React context tree for scoping state objects and hierarchical lookup.
 */
import { createContext, useContext, useRef } from 'react';

const root = {
  id: 'root',
  parent: null,
  items: new Map(),
  listeners: new Set(),
};

Node.resetRoot = () => {
  root.items.clear();
  root.listeners.clear();
};

const Context = createContext(root);

/**
 * Establishes a named node in the state tree; descendants can resolve properties via `Node.useNode`.
 *
 * @param {{ id: string, children?: import('react').ReactNode }} props
 */
export default function Node({ id, children }) {
  const parent = Node.useNode();
  const nodeRef = useRef(null);

  if (!nodeRef.current) {
    nodeRef.current = {
      id,
      parent,
      items: new Map(),
      listeners: new Set(),
    };
  } else {
    nodeRef.current.id = id;
    nodeRef.current.parent = parent;
  }

  return <Context value={nodeRef.current}>{children}</Context>;
}

Node.useNode = (propId) => {
  let node = useContext(Context);
  if (propId) {
    while (node && typeof nodeGetProperty(node, propId) === 'undefined') {
      node = node.parent;
    }
  }
  return node;
};

/** @param {{ parent?: object } | null | undefined} node */
export function nodeGetParent(node) {
  return node?.parent;
}

/** @param {{ items?: Map<unknown, unknown> } | null | undefined} node @param {unknown} propId */
export function nodeGetProperty(node, propId) {
  return node?.items?.get(propId);
}

/**
 * Stores `value` on `node` under `id` and notifies listeners on the next microtask.
 *
 * @param {{ items?: Map<unknown, unknown>, listeners?: Set<Function> } | null | undefined} node
 * @param {unknown} id
 * @param {unknown} value
 */
export function nodeSetProperty(node, id, value) {
  if (node?.items) {
    node.items.set(id, value);
    queueMicrotask(() => {
      for (const callback of node.listeners || []) {
        callback(node, id, value);
      }
    });
  }
}

/**
 * @param {{ listeners?: Set<Function> } | null | undefined} node
 * @param {(node: object, propId: unknown, value: unknown) => void} callback
 * @returns {() => void}
 */
export function subscribeToNode(node, callback) {
  if (node?.listeners) {
    node.listeners.add(callback);
    return () => node.listeners.delete(callback);
  }
  return () => {};
}

/** @param {{ id?: string } | null | undefined} node @returns {string | undefined} */
export function nodeGetId(node) {
  return node?.id;
}
