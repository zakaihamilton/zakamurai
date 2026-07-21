import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SidebarTree from './SidebarTree';

vi.mock('../VirtualList', () => ({
  default: ({ items, renderItem, className }) => (
    <div data-testid="virtual-list" className={className}>
      {items.map((row, index) => (
        <div key={row.pathStr || index}>{renderItem(row)}</div>
      ))}
    </div>
  ),
}));

vi.mock('../TreeItem', () => ({
  default: ({ row, isActive, isExpanded, isLoading }) => (
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
          {
            pathStr: 'src/App.jsx',
            item: { name: 'App.jsx', type: 'file' },
          },
        ]}
        activeTabId="src/App.jsx"
        scrollToIndex={null}
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
          {
            pathStr: 'root',
            item: { name: 'root', type: 'folder', isRoot: true },
          },
        ]}
        activeTabId={null}
        scrollToIndex={null}
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
