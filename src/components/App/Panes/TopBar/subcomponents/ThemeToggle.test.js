import { AppState } from '@/components/App/AppState';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import ThemeToggle from './ThemeToggle';

vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/Widgets/Tooltip/Tooltip', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));

describe('ThemeToggle', () => {
  it('renders sun icon in dark mode', () => {
    AppState.useState.mockReturnValue({
      theme: 'dark',
    });

    render(<ThemeToggle />);
    expect(screen.getByTestId('sun-icon')).toBeDefined();
  });

  it('renders moon icon in light mode', () => {
    AppState.useState.mockReturnValue({
      theme: 'light',
    });

    render(<ThemeToggle />);
    expect(screen.getByTestId('moon-icon')).toBeDefined();
  });

  it('toggles theme when clicked', () => {
    const appStateUpdater = vi.fn();
    const appStateMock = Object.assign(appStateUpdater, {
      theme: 'dark',
    });
    AppState.useState.mockReturnValue(appStateMock);

    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(appStateUpdater).toHaveBeenCalled();
  });
});

vi.mock('@/components/Core/Base/Icons', () => ({
  Icons: {
    Sun: () => <div data-testid="sun-icon" />,
    Moon: () => <div data-testid="moon-icon" />,
  },
}));
