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

export function nodeGetParent(node) {
  return node?.parent;
}

export function nodeGetProperty(node, propId) {
  return node?.items?.get(propId);
}

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

export function subscribeToNode(node, callback) {
  if (node?.listeners) {
    node.listeners.add(callback);
    return () => node.listeners.delete(callback);
  }
  return () => {};
}

export function nodeGetId(node) {
  return node?.id;
}
