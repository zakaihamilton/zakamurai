import { act, render, renderHook, screen } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Node, {
  nodeGetId,
  nodeGetParent,
  nodeGetProperty,
  nodeSetProperty,
  subscribeToNode,
} from './Node';
import type { StateNode } from './types';

describe('Node', () => {
  beforeEach(() => {
    Node.resetRoot();
  });

  it('provides nested node context and property helpers', async () => {
    let childNode: StateNode | null = null;
    let parentNode: StateNode | null | undefined = null;

    function Child() {
      childNode = Node.useNode();
      parentNode = nodeGetParent(childNode);
      return <div data-testid="child">{nodeGetId(childNode)}</div>;
    }

    render(
      <Node id="parent">
        <Node id="child">
          <Child />
        </Node>
      </Node>,
    );

    expect(screen.getByTestId('child')).toHaveTextContent('child');
    expect(nodeGetId(parentNode)).toBe('parent');

    const listener = vi.fn();
    const unsubscribe = subscribeToNode(childNode, listener);
    nodeSetProperty(childNode, 'value', 42);

    await act(async () => {
      await Promise.resolve();
    });

    expect(nodeGetProperty(childNode, 'value')).toBe(42);
    expect(listener).toHaveBeenCalledWith(childNode, 'value', 42);

    unsubscribe();
    nodeSetProperty(childNode, 'value', 43);
    await act(async () => {
      await Promise.resolve();
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('walks ancestors when looking up a property by id', () => {
    let found: StateNode | null = null;

    function Reader() {
      found = Node.useNode('shared');
      return null;
    }

    function Writer({ children }: { children: React.ReactNode }) {
      const node = Node.useNode();
      nodeSetProperty(node, 'shared', 'from-parent');
      return children;
    }

    render(
      <Node id="parent">
        <Writer>
          <Node id="child">
            <Reader />
          </Node>
        </Writer>
      </Node>,
    );

    expect(nodeGetId(found)).toBe('parent');
    expect(nodeGetProperty(found, 'shared')).toBe('from-parent');
  });

  it('returns no-op unsubscribe for invalid nodes', () => {
    const unsubscribe = subscribeToNode(null, vi.fn());
    expect(() => unsubscribe()).not.toThrow();
    expect(nodeGetId(null)).toBeUndefined();
    expect(nodeGetParent(null)).toBeUndefined();
  });

  it('exposes the root node outside of React tree', () => {
    const { result } = renderHook(() => Node.useNode());
    expect(nodeGetId(result.current)).toBe('root');
  });
});
