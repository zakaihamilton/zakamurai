import type { ReactNode } from 'react';
import { asNormalizedTreeNode, makeFlatTreeRow } from '@/test-utils/treeMocks';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SidebarTreeRow } from '../sidebar-types';
import SidebarTree from './Tree';

type VirtualListMockProps<T> = {
  items: T[];
  renderItem: (row: T) => ReactNode;
  className?: string;
};

vi.mock('../VirtualList', () => ({
  default: <T extends { pathStr?: string }>({
    items,
    renderItem,
    className,
  }: VirtualListMockProps<T>) => (
    <div data-testid="virtual-list" className={className}>
      {items.map((row, index) => (
        <div key={row.pathStr || index}>{renderItem(row)}</div>
      ))}
    </div>
  ),
}));

type TreeItemMockProps = {
  row: SidebarTreeRow;
  isActive: boolean;
  isExpanded: boolean;
  isLoading: boolean;
};

vi.mock('../TreeItem', () => ({
  default: ({ row, isActive, isExpanded, isLoading }: TreeItemMockProps) => (
    <div
      data-testid={`tree-item-${row.pathStr}`}
      data-active={String(isActive)}
      data-expanded={String(isExpanded)}
      data-loading={String(isLoading)}
    >
      {row.item?.name || 'create'}
    </div>
  ),
}));

describe('SidebarTree', () => {
  const handlers = {
    onToggle: vi.fn(),
    onOpenFile: vi.fn(),
    onRename: vi.fn(),
    onCreate: vi.fn(),
    onStartCreate: vi.fn(),
    onCancelCreate: vi.fn(),
    onDelete: vi.fn(),
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDragEnter: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    onDragEnd: vi.fn(),
  };

  it('renders tree rows and marks the active file', () => {
    render(
      <SidebarTree
        {...handlers}
        rows={[
          makeFlatTreeRow({
            pathStr: 'src/App.jsx',
            item: asNormalizedTreeNode({ name: 'App.jsx', type: 'file', path: ['src', 'App.jsx'] }),
          }) as SidebarTreeRow,
        ]}
        activeTabId="src/App.jsx"
        scrollToIndex={undefined}
        filterText=""
        expandedFolders={{}}
        loadingPaths={{}}
        draggedPath={null}
        dropTargetPath={null}
        isOpen={true}
        hasFileSystem={true}
      />,
    );

    const item = screen.getByTestId('tree-item-src/App.jsx');
    expect(item).toHaveAttribute('data-active', 'true');
    expect(item).toHaveTextContent('App.jsx');
  });

  it('shows an empty-state message when filtering with no filesystem', () => {
    render(
      <SidebarTree
        {...handlers}
        rows={[
          makeFlatTreeRow({
            pathStr: 'root',
            item: asNormalizedTreeNode({
              name: 'root',
              type: 'folder',
              path: ['root'],
              isRoot: true,
            }),
          }) as SidebarTreeRow,
        ]}
        activeTabId={null}
        scrollToIndex={undefined}
        filterText="missing"
        expandedFolders={{}}
        loadingPaths={{}}
        draggedPath={null}
        dropTargetPath={null}
        isOpen={true}
        hasFileSystem={false}
      />,
    );

    expect(screen.getByText('No files found matching "missing"')).toBeDefined();
  });
});
