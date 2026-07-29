import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Notification, NotificationState, useNotification } from './Notification';

vi.mock('@/components/state/State', () => ({
  createState: vi.fn(() => {
    const state = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    state.useState = vi.fn();
    return state;
  }),
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Check: () => <div data-testid="success-icon" />,
    AlertCircle: () => <div data-testid="error-icon" />,
    Info: () => <div data-testid="info-icon" />,
  },
}));

describe('Notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders notifications from state', () => {
    vi.mocked(NotificationState.useState).mockReturnValue({
      notifications: [
        { id: 1, message: 'Success message', type: 'success' },
        { id: 2, message: 'Error message', type: 'error' },
      ],
    } as never);

    render(<Notification />);

    expect(screen.getByText('Success message')).toBeDefined();
    expect(screen.getByText('Error message')).toBeDefined();
    expect(screen.getByTestId('success-icon')).toBeDefined();
    expect(screen.getByTestId('error-icon')).toBeDefined();
  });

  it('removes notification when clicked', () => {
    const stateUpdater = vi.fn();
    vi.mocked(NotificationState.useState).mockReturnValue(
      Object.assign(stateUpdater, {
        notifications: [{ id: 1, message: 'Test message', type: 'info' }],
      }) as never,
    );

    render(<Notification />);

    fireEvent.click(screen.getByRole('button'));
    expect(stateUpdater).toHaveBeenCalled();
  });

  it('useNotification hook can add and auto-remove a notification', async () => {
    vi.useFakeTimers();
    const stateUpdater = vi.fn((cb) => {
      const draft = { notifications: [] };
      if (typeof cb === 'function') cb(draft);
    });
    vi.mocked(NotificationState.useState).mockReturnValue(stateUpdater as never);

    const { renderHook } = await import('@testing-library/react');
    const { result } = renderHook(() => useNotification());

    act(() => {
      result.current.addNotification('Hook message', 'success', 2000);
    });

    expect(stateUpdater).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(stateUpdater).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
