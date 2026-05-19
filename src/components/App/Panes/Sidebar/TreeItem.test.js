import { AppState } from '@/components/App/AppState';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
});
