import { makeAgentSession } from '@/test-utils/agentSessionMocks';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import SessionTreeDialog from './SessionTreeDialog';

type DialogMockProps = {
  isOpen?: boolean;
  title?: string;
  children?: ReactNode;
};

vi.mock('@/components/ui/Dialog', () => ({
  default: ({ isOpen, title, children }: DialogMockProps) =>
    isOpen ? <div aria-label={title}>{children}</div> : null,
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    ChevronDown: () => <span>down</span>,
    ChevronRight: () => <span>right</span>,
    Copy: () => <span>copy</span>,
    Edit: () => <span>edit</span>,
    Trash: () => <span>trash</span>,
    Plus: () => <span>plus</span>,
  },
}));

describe('SessionTreeDialog', () => {
  const sessions = {
    root: makeAgentSession({
      id: 'root',
      name: 'Root',
      parentId: null,
      mode: 'single',
      status: 'idle',
    }),
    branch: makeAgentSession({
      id: 'branch',
      name: 'Branch',
      parentId: 'root',
      mode: 'team',
      status: 'idle',
    }),
  };

  it('browses, selects, and manages nested agent branches', () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    const onBranch = vi.fn();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <SessionTreeDialog
        isOpen
        sessions={sessions}
        activeSessionId="root"
        onCancel={vi.fn()}
        onSelect={onSelect}
        onCreate={onCreate}
        onBranch={onBranch}
        onRename={onRename}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Conversation history' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Branch Root' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rename Root' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Root and branches' }));
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    fireEvent.click(screen.getByText('Branch'));

    expect(onBranch).toHaveBeenCalledWith('root');
    expect(onRename).toHaveBeenCalledWith('root');
    expect(onDelete).toHaveBeenCalledWith('root');
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('branch');
  });

  it('disables branch deletion when a descendant is running', () => {
    render(
      <SessionTreeDialog
        isOpen
        sessions={{
          ...sessions,
          branch: makeAgentSession({ ...sessions.branch, status: 'running' }),
        }}
        activeSessionId="root"
        onCancel={vi.fn()}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onBranch={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Delete Root and branches' })).toBeDisabled();
  });
});
