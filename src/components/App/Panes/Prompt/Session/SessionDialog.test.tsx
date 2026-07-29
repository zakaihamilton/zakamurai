import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SessionDialog from './SessionDialog';

vi.mock('@/components/ui/Dialog', () => ({
  default: ({ isOpen, title, message, confirmText, cancelText, onConfirm, onCancel, children }) =>
    isOpen ? (
      <div data-testid="dialog">
        <h2>{title}</h2>
        <p>{message}</p>
        {children}
        <button type="button" onClick={onConfirm}>
          {confirmText}
        </button>
        <button type="button" onClick={onCancel}>
          {cancelText}
        </button>
      </div>
    ) : null,
}));

describe('SessionDialog', () => {
  it('renders null when sessionDialog is null', () => {
    const { container } = render(<SessionDialog sessionDialog={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('handles rename dialog input and confirm/cancel', () => {
    const agentSessionState = vi.fn((cb) =>
      cb({ sessions: { s1: { id: 's1', name: 'Old Name' } }, activeSessionId: 's1' }),
    );
    const promptUiState = vi.fn((cb) => cb({ sessionDialog: { value: 'New Name' } }));

    const sessionDialog = {
      type: 'rename',
      sessionId: 's1',
      value: 'Old Name',
    };

    render(
      <SessionDialog
        sessionDialog={sessionDialog}
        runningSessionId={null}
        isAIProcessing={false}
        agentSessionState={agentSessionState}
        promptUiState={promptUiState}
      />,
    );

    expect(screen.getByText('Rename session')).toBeDefined();
    const input = screen.getByLabelText('Session name');
    fireEvent.change(input, { target: { value: 'New Name' } });
    expect(promptUiState).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Rename'));
    expect(agentSessionState).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Cancel'));
  });

  it('handles delete dialog confirm when session is running vs idle', () => {
    const promptUiState = vi.fn((cb) => cb({ sessionDialog: {} }));
    const agentSessionState = vi.fn((cb) =>
      cb({ sessions: { s1: { id: 's1', name: 'My Session' } }, activeSessionId: 's1' }),
    );

    const sessionDialog = {
      type: 'delete',
      sessionId: 's1',
      name: 'My Session',
    };

    // When running and processing -> shows error
    const { rerender } = render(
      <SessionDialog
        sessionDialog={sessionDialog}
        runningSessionId="s1"
        isAIProcessing={true}
        agentSessionState={agentSessionState}
        promptUiState={promptUiState}
      />,
    );

    fireEvent.click(screen.getByText('Delete'));

    // When idle -> deletes session
    rerender(
      <SessionDialog
        sessionDialog={sessionDialog}
        runningSessionId={null}
        isAIProcessing={false}
        agentSessionState={agentSessionState}
        promptUiState={promptUiState}
      />,
    );

    fireEvent.click(screen.getByText('Delete'));
    expect(agentSessionState).toHaveBeenCalled();
  });

  it('renders error dialog type', () => {
    const sessionDialog = {
      type: 'error',
      message: 'Something failed',
    };

    render(
      <SessionDialog
        sessionDialog={sessionDialog}
        runningSessionId={null}
        isAIProcessing={false}
        agentSessionState={vi.fn()}
        promptUiState={vi.fn()}
      />,
    );

    expect(screen.getByText('Session error')).toBeDefined();
    expect(screen.getByText('Something failed')).toBeDefined();
    expect(screen.getByText('Close')).toBeDefined();
  });
});
