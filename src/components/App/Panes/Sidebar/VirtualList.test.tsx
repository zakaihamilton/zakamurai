import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import VirtualList from './VirtualList';

type TestItem = { key: string; pathStr: string; label: string };

describe('VirtualList', () => {
  it('renders visible items', () => {
    const items: TestItem[] = Array.from({ length: 20 }, (_, i) => ({
      key: String(i),
      pathStr: `item-${i}`,
      label: `Item ${i}`,
    }));
    render(
      <VirtualList
        items={items}
        itemHeight={24}
        renderItem={(item) => <div>{item.label}</div>}
        style={{ height: 200 }}
      />,
    );

    expect(screen.getByText('Item 0')).toBeDefined();
    expect(screen.queryByText('Item 19')).toBeNull();
  });
});
