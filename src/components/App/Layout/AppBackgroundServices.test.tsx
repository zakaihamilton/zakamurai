import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppBackgroundServices from './AppBackgroundServices';

const useAppBackgroundServices = vi.fn();

vi.mock('../AppBackgroundServices', () => ({
  useAppBackgroundServices: (...args: unknown[]) => useAppBackgroundServices(...args),
}));

vi.mock('@/components/ui/Notification', () => ({
  Notification: () => <div data-testid="notification" />,
}));

describe('AppBackgroundServices', () => {
  it('wires background services and renders notifications', () => {
    render(<AppBackgroundServices />);

    expect(useAppBackgroundServices).toHaveBeenCalled();
    expect(screen.getByTestId('notification')).toBeDefined();
  });
});
