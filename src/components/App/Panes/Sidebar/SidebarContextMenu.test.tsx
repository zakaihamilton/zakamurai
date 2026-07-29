import { asNormalizedTreeNode } from '@/test-utils/treeMocks';
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SidebarContextMenu from './SidebarContextMenu';

vi.mock('@/components/ui/ContextMenu', () => ({
  default: ({ children }: { children?: ReactNode }) => (
    <div data-testid="context-menu">{children}</div>
  ),
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Folder: () => <span data-testid="icon-folder" />,
    File: () => <span data-testid="icon-file" />,
    Image: () => <span data-testid="icon-image" />,
    FilePlus: () => <span />,
    FolderPlus: () => <span />,
    Edit: () => <span />,
    Trash: () => <span />,
    Code: () => <span />,
    Tokens: () => <span />,
  },
}));

describe('SidebarContextMenu', () => {
  const baseProps = {
    pathStr: 'src/App.jsx',
    isLoading: false,
    isExpanded: false,
    position: { x: 10, y: 20 },
    onClose: vi.fn(),
    onStartCreate: vi.fn(),
    onStartRename: vi.fn(),
    onStartDelete: vi.fn(),
    onOpenWith: vi.fn(),
  };

  it('shows create options for folders and hides delete for root', () => {
    const onStartCreate = vi.fn();
    render(
      <SidebarContextMenu
        {...baseProps}
        onStartCreate={onStartCreate}
        item={asNormalizedTreeNode({ name: 'src', type: 'folder', path: ['src'], isRoot: true })}
        pathStr="src"
      />,
    );

    fireEvent.click(screen.getByText('New File'));
    expect(onStartCreate).toHaveBeenCalledWith('file');

    fireEvent.click(screen.getByText('New Folder'));
    expect(onStartCreate).toHaveBeenCalledWith('folder');

    expect(screen.queryByText('Delete')).toBeNull();
    expect(screen.getByText('Root')).toBeDefined();
  });

  it('shows open-with options for files and supports rename/delete', () => {
    const onOpenWith = vi.fn();
    const onStartRename = vi.fn();
    const onStartDelete = vi.fn();

    render(
      <SidebarContextMenu
        {...baseProps}
        onOpenWith={onOpenWith}
        onStartRename={onStartRename}
        onStartDelete={onStartDelete}
        item={asNormalizedTreeNode({ name: 'App.jsx', type: 'file', path: ['App.jsx'] })}
      />,
    );

    expect(screen.getByText('Open With')).toBeDefined();
    fireEvent.click(screen.getByText('Editor'));
    expect(onOpenWith).toHaveBeenCalledWith('editor');

    fireEvent.click(screen.getByText('Rename'));
    expect(onStartRename).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Delete'));
    expect(onStartDelete).toHaveBeenCalled();
  });
});
