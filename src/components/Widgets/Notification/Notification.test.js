import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Notification, NotificationState, useNotification } from './Notification';

vi.mock('@/components/Core/Base/State', () => ({
  createState: vi.fn(() => {
    const state = ({ children }) => <div>{children}</div>;
    state.useState = vi.fn();
    return state;
  }),
}));

vi.mock('@/components/Core/Base/Icons', () => ({
  Icons: {
    Code: () => <div data-testid="success-icon" />,
    Trash: () => <div data-testid="error-icon" />,
    Bot: () => <div data-testid="info-icon" />,
  },
}));

describe('Notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders notifications from state', () => {
    NotificationState.useState.mockReturnValue({
      notifications: [
        { id: 1, message: 'Success message', type: 'success' },
        { id: 2, message: 'Error message', type: 'error' },
      ],
    });

    render(<Notification />);

    expect(screen.getByText('Success message')).toBeDefined();
    expect(screen.getByText('Error message')).toBeDefined();
    expect(screen.getByTestId('success-icon')).toBeDefined();
    expect(screen.getByTestId('error-icon')).toBeDefined();
  });

  it('removes notification when clicked', () => {
    const stateUpdater = vi.fn();
    NotificationState.useState.mockReturnValue(
      Object.assign(stateUpdater, {
        notifications: [{ id: 1, message: 'Test message', type: 'info' }],
      }),
    );

    render(<Notification />);

    fireEvent.click(screen.getByRole('button'));
    expect(stateUpdater).toHaveBeenCalled();
  });
});
