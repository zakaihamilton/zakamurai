/**
 * @fileoverview React context tree for scoping state objects and hierarchical lookup.
 */
import { createContext, useContext, useRef, type ReactNode } from 'react';
import type { NodeListener, StateNode } from './types';

const root: StateNode = {
  id: 'root',
  parent: null,
  items: new Map(),
  listeners: new Set(),
};

interface NodeComponent {
  (props: { id: string; children?: ReactNode }): ReactNode;
  useNode: (propId?: unknown) => StateNode | null;
  resetRoot: () => void;
}

const Node: NodeComponent = function Node({ id, children }) {
  const parent = Node.useNode();
  const nodeRef = useRef<StateNode | null>(null);

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
};

Node.resetRoot = () => {
  root.items.clear();
  root.listeners.clear();
};

const Context = createContext<StateNode>(root);

Node.useNode = (propId?: unknown): StateNode | null => {
  let node: StateNode | null = useContext(Context);
  if (propId) {
    while (node && typeof nodeGetProperty(node, propId) === 'undefined') {
      node = node.parent;
    }
  }
  return node;
};

export function nodeGetParent(node: StateNode | null | undefined): StateNode | null | undefined {
  return node?.parent;
}

export function nodeGetProperty(node: StateNode | null | undefined, propId: unknown): unknown {
  return node?.items?.get(propId);
}

export function nodeSetProperty(
  node: StateNode | null | undefined,
  id: unknown,
  value: unknown,
): void {
  if (node?.items) {
    node.items.set(id, value);
    queueMicrotask(() => {
      for (const callback of node.listeners || []) {
        callback(node, id, value);
      }
    });
  }
}

export function subscribeToNode(
  node: StateNode | null | undefined,
  callback: NodeListener,
): () => void {
  if (node?.listeners) {
    node.listeners.add(callback);
    return () => node.listeners.delete(callback);
  }
  return () => {};
}

export function nodeGetId(node: StateNode | null | undefined): string | undefined {
  return node?.id;
}

export default Node;
