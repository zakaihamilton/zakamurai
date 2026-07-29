import type { SidebarCreateRow } from '@/components/App/Panes/Sidebar/sidebar-types';
import type { TreeItemStateShape } from '@/components/state/domain-types';
import { createMockStateStore } from '@/test-utils/stateMocks';
import { makeFlatTreeRow, makeNormalizedTreeNode } from '@/test-utils/treeMocks';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CreateRowInput from './CreateRowInput';
import { TreeItemState } from './TreeItem';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Folder: () => <span data-testid="folder-icon" />,
    File: () => <span data-testid="file-icon" />,
  },
}));

describe('CreateRowInput', () => {
  const parentRow = makeFlatTreeRow({
    key: 'src',
    item: makeNormalizedTreeNode('src', 'folder', ['src'], []),
    level: 0,
    path: ['src'],
    pathStr: 'src',
  });

  const baseRow = {
    ...makeFlatTreeRow({
      key: 'src::__create__',
      item: makeNormalizedTreeNode('', 'file', ['src']),
      level: 1,
      path: ['src'],
      pathStr: 'src',
    }),
    isCreateRow: true,
    createType: 'file',
    parentRow,
  } as SidebarCreateRow;

  function mockCreateState(createValue = '') {
    const state = createMockStateStore<TreeItemStateShape>({
      isEditing: false,
      editValue: '',
      createValue,
      contextMenu: null,
      showDeleteDialog: false,
    });
    vi.spyOn(TreeItemState, 'useState').mockReturnValue(state);
    return { hook: state, state: { createValue } };
  }

  it('renders a file create input with child indent', () => {
    mockCreateState();
    const { container } = render(
      <CreateRowInput
        row={baseRow}
        onCreate={vi.fn().mockResolvedValue(true)}
        onCancelCreate={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox')).toBeDefined();
    expect(screen.getByTestId('file-icon')).toBeDefined();
    expect(container.querySelector('[class*="createInputContainer"]')).toBeDefined();
  });

  it('renders a folder icon for folder create rows', () => {
    mockCreateState();
    render(
      <CreateRowInput
        row={{ ...baseRow, createType: 'folder' }}
        onCreate={vi.fn().mockResolvedValue(true)}
        onCancelCreate={vi.fn()}
      />,
    );

    expect(screen.getByTestId('folder-icon')).toBeDefined();
  });

  it('submits on Enter when the name is non-empty', async () => {
    mockCreateState('new-file.js');
    const onCreate = vi.fn().mockResolvedValue(true);
    const onCancelCreate = vi.fn();

    render(<CreateRowInput row={baseRow} onCreate={onCreate} onCancelCreate={onCancelCreate} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new-file.js' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(parentRow, 'file', 'new-file.js');
    });
    expect(onCancelCreate).toHaveBeenCalled();
  });

  it('cancels on Escape without creating', () => {
    mockCreateState('draft.js');
    const onCreate = vi.fn();
    const onCancelCreate = vi.fn();

    render(<CreateRowInput row={baseRow} onCreate={onCreate} onCancelCreate={onCancelCreate} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onCreate).not.toHaveBeenCalled();
    expect(onCancelCreate).toHaveBeenCalled();
  });

  it('cancels on blur when create fails or name is empty', async () => {
    mockCreateState('   ');
    const onCreate = vi.fn().mockResolvedValue(false);
    const onCancelCreate = vi.fn();

    render(<CreateRowInput row={baseRow} onCreate={onCreate} onCancelCreate={onCancelCreate} />);

    fireEvent.blur(screen.getByRole('textbox'));
    expect(onCreate).not.toHaveBeenCalled();
    expect(onCancelCreate).toHaveBeenCalled();
  });

  it('does not cancel when create returns false for a valid name', async () => {
    mockCreateState('blocked.js');
    const onCreate = vi.fn().mockResolvedValue(false);
    const onCancelCreate = vi.fn();

    render(<CreateRowInput row={baseRow} onCreate={onCreate} onCancelCreate={onCancelCreate} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(parentRow, 'file', 'blocked.js');
    });
    expect(onCancelCreate).not.toHaveBeenCalled();
  });
});
