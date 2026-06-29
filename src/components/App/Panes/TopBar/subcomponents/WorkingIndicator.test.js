import { LogState } from '@/components/App/Views/LogArea';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkingIndicator from './WorkingIndicator';

vi.mock('@/components/App/Views/LogArea', () => ({ LogState: { useState: vi.fn() } }));
vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    BotSmall: () => <span data-testid="icon-bot" />,
    RefreshSmall: () => <span data-testid="icon-refresh" />,
  },
}));

describe('WorkingIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when idle', () => {
    LogState.useState.mockReturnValue({ isSystemProcessing: false, isAIProcessing: false });
    const { container } = render(<WorkingIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('shows AI working indicator', () => {
    LogState.useState.mockReturnValue({ isSystemProcessing: false, isAIProcessing: true });
    render(<WorkingIndicator />);
    expect(screen.getByText('AI working...')).toBeDefined();
  });

  it('shows system working indicator', () => {
    LogState.useState.mockReturnValue({ isSystemProcessing: true, isAIProcessing: false });
    render(<WorkingIndicator />);
    expect(screen.getByText('System working...')).toBeDefined();
  });
});
