import { AppState } from '@/components/App/AppState';
import { requireElement } from '@/test-utils/domMocks';
import { makeAppState } from '@/test-utils/stateMocks';
import { asNormalizedTreeNode, makeFlatTreeRow } from '@/test-utils/treeMocks';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TreeItem from './TreeItem';
import type { SidebarTreeRow } from './sidebar-types';

vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/utils/keyboard', () => ({
  useShouldShowKeyboardShortcuts: vi.fn(() => true),
}));

const baseHandlers = {
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

const treeItemProps = {
  ...baseHandlers,
  isActive: false,
  isDragged: false,
  isDropTarget: false,
  isExpanded: false,
  isLoading: false,
};

const makeRow = (name: string): SidebarTreeRow =>
  makeFlatTreeRow({
    item: asNormalizedTreeNode({ name, type: 'file', path: [name] }),
    path: [name],
    pathStr: name,
  }) as SidebarTreeRow;

const makeFolderRow = (
  name: string,
  path: string[] = [name],
  extra: Record<string, unknown> = {},
): SidebarTreeRow =>
  makeFlatTreeRow({
    item: asNormalizedTreeNode({ name, type: 'folder', path, children: [], ...extra }),
    level: path.length - 1,
    path,
    pathStr: path.join('/'),
  }) as SidebarTreeRow;

function draggableElement(label: string): Element {
  return requireElement(screen.getByText(label).closest('[draggable="true"]'));
}

describe('TreeItem', () => {
  beforeEach(() => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ theme: 'dark' }));
    if (typeof window !== 'undefined') {
      window.ontouchstart = () => {};
    }
  });

  it('keeps editing state isolated per row', async () => {
    render(
      <>
        <TreeItem row={makeRow('first.js')} {...treeItemProps} />
        <TreeItem row={makeRow('second.js')} {...treeItemProps} />
      </>,
    );

    fireEvent.doubleClick(screen.getByText('first.js'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('first.js')).toBeDefined();
      expect(screen.queryByDisplayValue('second.js')).toBeNull();
      expect(screen.getByText('second.js')).toBeDefined();
    });
  });

  it('starts editing the project root on double click', async () => {
    const rootRow = makeFolderRow('Test Project', [], { isRoot: true });

    render(<TreeItem row={rootRow} {...treeItemProps} />);

    fireEvent.doubleClick(screen.getByText('Test Project'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Project')).toBeDefined();
    });
  });

  it('opens a file when its row is clicked', () => {
    const onOpenFile = vi.fn();

    render(<TreeItem row={makeRow('app.js')} {...treeItemProps} onOpenFile={onOpenFile} />);

    fireEvent.click(screen.getByRole('button', { name: /app\.js/i }));

    expect(onOpenFile).toHaveBeenCalledWith(makeRow('app.js'));
  });

  it('toggles a folder when its row is clicked', () => {
    const onToggle = vi.fn();
    const folderRow = makeFolderRow('src');

    render(<TreeItem row={folderRow} {...treeItemProps} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('button', { name: /src/i }));

    expect(onToggle).toHaveBeenCalledWith(folderRow);
  });

  it('opens context menu on long touch press', async () => {
    vi.useFakeTimers();
    render(<TreeItem row={makeRow('app.js')} {...treeItemProps} />);

    const itemElement = draggableElement('app.js');

    fireEvent.touchStart(itemElement, {
      touches: [{ clientX: 10, clientY: 20, pageX: 10, pageY: 20 }],
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.queryByRole('menu')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByRole('menu')).toBeDefined();

    vi.useRealTimers();
  });

  it('cancels context menu on touch move', async () => {
    vi.useFakeTimers();
    render(<TreeItem row={makeRow('app.js')} {...treeItemProps} />);

    const itemElement = draggableElement('app.js');

    fireEvent.touchStart(itemElement, {
      touches: [{ clientX: 10, clientY: 20, pageX: 10, pageY: 20 }],
    });

    fireEvent.touchMove(itemElement, {
      touches: [{ clientX: 25, clientY: 20, pageX: 25, pageY: 20 }],
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(screen.queryByRole('menu')).toBeNull();

    vi.useRealTimers();
  });

  it('cancels context menu on rapid touch end', async () => {
    vi.useFakeTimers();
    render(<TreeItem row={makeRow('app.js')} {...treeItemProps} />);

    const itemElement = draggableElement('app.js');

    fireEvent.touchStart(itemElement, {
      touches: [{ clientX: 10, clientY: 20, pageX: 10, pageY: 20 }],
    });

    fireEvent.touchEnd(itemElement);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(screen.queryByRole('menu')).toBeNull();

    vi.useRealTimers();
  });

  it('displays a header showing file/folder name and path in context menu', async () => {
    const customRow = makeFlatTreeRow({
      item: asNormalizedTreeNode({ name: 'app.js', type: 'file', path: ['sub', 'dir', 'app.js'] }),
      level: 2,
      path: ['sub', 'dir', 'app.js'],
      pathStr: 'sub/dir/app.js',
    }) as SidebarTreeRow;
    render(<TreeItem row={customRow} {...treeItemProps} />);

    const itemElement = requireElement(screen.getByText('app.js').closest('[draggable="true"]'));

    // Right click to open context menu wrapped in act
    act(() => {
      fireEvent.contextMenu(itemElement);
    });

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined();
      // Name of file
      expect(screen.getByTitle('app.js')).toBeDefined();
      // Path of file
      expect(screen.getByTitle('/sub/dir/app.js')).toBeDefined();
    });
  });

  it('shows Open With for normal files', async () => {
    const onOpenFile = vi.fn();
    const row = makeRow('app.js');
    render(<TreeItem row={row} {...treeItemProps} onOpenFile={onOpenFile} />);

    await act(async () => {
      fireEvent.contextMenu(draggableElement('app.js'));
    });

    await waitFor(() => {
      expect(screen.getByText('Open With')).toBeDefined();
      expect(screen.getByText('Editor')).toBeDefined();
      expect(screen.getByText('Token Breakdown')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Editor'));
    });
    expect(onOpenFile).toHaveBeenCalledWith(row, { viewType: 'editor' });
  });

  it('shows the Image viewer in Open With for SVG files', async () => {
    const onOpenFile = vi.fn();
    const row = makeRow('logo.svg');
    render(<TreeItem row={row} {...treeItemProps} onOpenFile={onOpenFile} />);

    await act(async () => {
      fireEvent.contextMenu(draggableElement('logo.svg'));
    });

    await waitFor(() => {
      expect(screen.getByText('Editor')).toBeDefined();
      expect(screen.getByText('Image Viewer')).toBeDefined();
      expect(screen.getByText('Token Breakdown')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Image Viewer'));
    });
    expect(onOpenFile).toHaveBeenCalledWith(row, { viewType: 'image-viewer' });
  });

  it('shows the delete dialog with a readable path preview', async () => {
    const row = makeFolderRow('components', ['src', 'components']);
    render(<TreeItem row={row} {...treeItemProps} />);

    await act(async () => {
      fireEvent.contextMenu(draggableElement('components'));
    });

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    await waitFor(() => {
      expect(screen.getByText('Delete Item')).toBeDefined();
      expect(screen.getByText('src/components')).toBeDefined();
      expect(screen.getByText('src/components').className).toContain('detailBox');
    });
  });

  it('shows rename but not delete for the project root context menu', async () => {
    const rootRow = makeFolderRow('Test Project', [], { isRoot: true });
    render(<TreeItem row={rootRow} {...treeItemProps} />);

    const itemElement = requireElement(
      screen.getByText('Test Project').closest('[draggable="false"]'),
    );

    act(() => {
      fireEvent.contextMenu(itemElement);
    });

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined();
      expect(screen.getByText('Rename')).toBeDefined();
      expect(screen.queryByText('Delete')).toBeNull();
    });
  });

  it('starts create via context menu', async () => {
    const onStartCreate = vi.fn();
    const folderRow = makeFolderRow('src');
    render(<TreeItem row={folderRow} {...treeItemProps} onStartCreate={onStartCreate} />);

    await act(async () => {
      fireEvent.contextMenu(draggableElement('src'));
    });

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('New File'));
    });

    expect(onStartCreate).toHaveBeenCalledWith(folderRow, 'file');
  });
});
