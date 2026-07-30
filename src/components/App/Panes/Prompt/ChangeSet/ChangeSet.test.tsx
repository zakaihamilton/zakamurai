import { TabState } from '@/components/App/Panes/TabBar';
import { ChangeSetState } from '@/components/Workspace';
import { makeChangeSetState, makeTabState } from '@/test-utils/stateMocks';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChangeSetPanel from './ChangeSet';

vi.mock('@/components/Workspace', () => ({
  ChangeSetState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/App/Panes/TabBar', () => ({
  TabState: {
    usePassiveState: vi.fn(),
  },
}));

describe('ChangeSetPanel', () => {
  const tabState = makeTabState();

  vi.mocked(TabState.usePassiveState).mockReturnValue(tabState);

  it('renders null when active change set is not found', () => {
    vi.mocked(ChangeSetState.useState).mockReturnValue(
      makeChangeSetState({ activeId: 'cs1', items: [] }),
    );
    const { container } = render(<ChangeSetPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('supports an active change set arriving after an empty render', () => {
    const state = makeChangeSetState({ activeId: 'cs1', items: [] });
    vi.mocked(ChangeSetState.useState).mockReturnValue(state);
    const { rerender } = render(<ChangeSetPanel />);

    state.items = [
      {
        id: 'cs1',
        status: 'pending-review',
        request: 'Add a todo app',
        createdAt: Date.now(),
        files: [{ path: 'src/Todo.tsx', status: 'pending-review' }],
      },
    ];
    rerender(<ChangeSetPanel />);

    expect(screen.getByText('Add a todo app')).toBeDefined();
  });

  it('renders change set details, reviewed counts, and file list', () => {
    vi.mocked(ChangeSetState.useState).mockReturnValue(
      makeChangeSetState({
        activeId: 'cs1',
        items: [
          {
            id: 'cs1',
            status: 'pending-review',
            request: 'Refactor components',
            createdAt: Date.now(),
            files: [
              { path: 'src/App.js', status: 'accepted' },
              { path: 'src/index.js', status: 'conflicted' },
              { path: 'src/utils.js', status: 'pending-review' },
              { path: 'src/hooks/useTodo.js', status: 'pending-review' },
              { path: 'src/components/TodoItem.js', status: 'pending-review' },
              { path: 'src/components/TodoList.js', status: 'pending-review' },
              { path: 'src/styles/todo.css', status: 'pending-review' },
            ],
          },
        ],
      }),
    );

    render(<ChangeSetPanel />);

    expect(screen.getByText('Change set')).toBeDefined();
    expect(screen.getByText('pending-review')).toBeDefined();
    expect(screen.getByText('Refactor components')).toBeDefined();
    expect(screen.getByText(/2\/7 files reviewed/)).toBeDefined();
    expect(screen.getByText('src/App.js')).toBeDefined();
    expect(screen.getByText('⚠ src/index.js')).toBeDefined();
    expect(screen.getByText('src/utils.js')).toBeDefined();
    expect(screen.getByText('src/styles/todo.css')).toBeDefined();
  });

  it('opens a change-set file in an editor tab', () => {
    vi.mocked(ChangeSetState.useState).mockReturnValue(
      makeChangeSetState({
        activeId: 'cs1',
        items: [
          {
            id: 'cs1',
            status: 'pending-review',
            request: 'Update the app',
            createdAt: Date.now(),
            files: [{ path: 'src/App.js', status: 'pending-review' }],
          },
        ],
      }),
    );

    render(<ChangeSetPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'src/App.js' }));

    expect(tabState.activeTabId).toBe('src/App.js');
    expect(tabState.openTabs).toEqual([
      {
        id: 'src/App.js',
        type: 'file',
        label: 'App.js',
        file: { name: 'App.js', path: ['src', 'App.js'], content: '' },
      },
    ]);
  });
});
