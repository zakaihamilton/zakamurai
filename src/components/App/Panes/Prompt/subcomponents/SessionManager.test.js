import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SessionManager from './SessionManager';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Plus: () => <span>plus</span>,
    Edit: () => <span>edit</span>,
    Trash: () => <span>trash</span>,
  },
}));

describe('SessionManager', () => {
  const sessions = [
    { id: 'a', name: 'Agent A', status: 'idle' },
    { id: 'b', name: 'Agent B', status: 'running' },
  ];

  it('switches sessions and triggers manage actions', () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <SessionManager
        sessions={sessions}
        activeSessionId="a"
        onSelect={onSelect}
        onCreate={onCreate}
        onRename={onRename}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /Agent B/i }));
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(screen.getByLabelText('Running')).toBeDefined();

    fireEvent.click(screen.getByLabelText('New session'));
    fireEvent.click(screen.getByLabelText('Rename session'));
    fireEvent.click(screen.getByLabelText('Delete session'));
    expect(onCreate).toHaveBeenCalled();
    expect(onRename).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });
});
