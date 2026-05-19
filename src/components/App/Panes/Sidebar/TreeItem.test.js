import { AppState } from '@/components/App/AppState';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TreeItem from './TreeItem';

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
  onDelete: vi.fn(),
  onDragStart: vi.fn(),
  onDragOver: vi.fn(),
  onDragEnter: vi.fn(),
  onDragLeave: vi.fn(),
  onDrop: vi.fn(),
  onDragEnd: vi.fn(),
};

const makeRow = (name) => ({
  item: { name, type: 'file' },
  level: 0,
  path: [name],
  pathStr: name,
});

describe('TreeItem', () => {
  beforeEach(() => {
    vi.spyOn(AppState, 'useState').mockReturnValue({ theme: 'dark' });
    if (typeof window !== 'undefined') {
      window.ontouchstart = () => {};
    }
  });

  it('keeps editing state isolated per row', async () => {
    render(
      <>
        <TreeItem row={makeRow('first.js')} {...baseHandlers} />
        <TreeItem row={makeRow('second.js')} {...baseHandlers} />
      </>,
    );

    fireEvent.doubleClick(screen.getByText('first.js'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('first.js')).toBeDefined();
      expect(screen.queryByDisplayValue('second.js')).toBeNull();
      expect(screen.getByText('second.js')).toBeDefined();
    });
  });

  it('opens a file when its row is clicked', () => {
    const onOpenFile = vi.fn();

    render(<TreeItem row={makeRow('app.js')} {...baseHandlers} onOpenFile={onOpenFile} />);

    fireEvent.click(screen.getByRole('button', { name: /app\.js/i }));

    expect(onOpenFile).toHaveBeenCalledWith(makeRow('app.js'));
  });

  it('toggles a folder when its row is clicked', () => {
    const onToggle = vi.fn();
    const folderRow = {
      item: { name: 'src', type: 'folder', children: [] },
      level: 0,
      path: ['src'],
      pathStr: 'src',
    };

    render(<TreeItem row={folderRow} {...baseHandlers} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('button', { name: /src/i }));

    expect(onToggle).toHaveBeenCalledWith(folderRow);
  });

  it('opens context menu on long touch press', async () => {
    vi.useFakeTimers();
    render(<TreeItem row={makeRow('app.js')} {...baseHandlers} />);

    const itemElement = screen.getByText('app.js').closest('[draggable="true"]');

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
    render(<TreeItem row={makeRow('app.js')} {...baseHandlers} />);

    const itemElement = screen.getByText('app.js').closest('[draggable="true"]');

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
    render(<TreeItem row={makeRow('app.js')} {...baseHandlers} />);

    const itemElement = screen.getByText('app.js').closest('[draggable="true"]');

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
    const customRow = {
      item: { name: 'app.js', type: 'file' },
      level: 2,
      path: ['sub', 'dir', 'app.js'],
      pathStr: 'sub/dir/app.js',
    };
    render(<TreeItem row={customRow} {...baseHandlers} />);

    const itemElement = screen.getByText('app.js').closest('[draggable="true"]');

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
});
