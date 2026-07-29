import { AppState } from '@/components/App/AppState';
import { makeAppState } from '@/test-utils/stateMocks';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ThemeToggle from './ThemeToggle';

vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/ui/Tooltip', () => ({
  __esModule: true,
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Sun: () => <div data-testid="sun-icon" />,
    Moon: () => <div data-testid="moon-icon" />,
  },
}));

describe('ThemeToggle', () => {
  it('renders sun icon in dark mode', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ theme: 'dark' }));

    render(<ThemeToggle />);
    expect(screen.getByTestId('sun-icon')).toBeDefined();
  });

  it('renders moon icon in light mode', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ theme: 'light' }));

    render(<ThemeToggle />);
    expect(screen.getByTestId('moon-icon')).toBeDefined();
  });

  it('toggles theme when clicked', () => {
    const appState = makeAppState({ theme: 'dark' });
    vi.mocked(AppState.useState).mockReturnValue(appState);

    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));

    expect(appState).toHaveBeenCalled();
  });
});
