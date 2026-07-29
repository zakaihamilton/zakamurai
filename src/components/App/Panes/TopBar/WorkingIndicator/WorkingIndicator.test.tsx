import { LogState } from '@/components/App/Views/LogArea';
import { makeLogState } from '@/test-utils/stateMocks';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkingIndicator from './WorkingIndicator';

vi.mock('@/components/App/Views/LogArea', () => ({ LogState: { useState: vi.fn() } }));
vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    BotSmall: () => <span data-testid="icon-bot" />,
  },
}));
vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ content, children }: { content: string; children: React.ReactNode }) => (
    <div data-tooltip-content={content}>{children}</div>
  ),
}));

describe('WorkingIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when idle', () => {
    vi.mocked(LogState.useState).mockReturnValue(makeLogState({ isAIProcessing: false }));
    const { container } = render(<WorkingIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('shows AI working indicator', () => {
    vi.mocked(LogState.useState).mockReturnValue(makeLogState({ isAIProcessing: true }));
    render(<WorkingIndicator />);
    expect(screen.getByLabelText('AI working...')).toBeDefined();
    expect(screen.getByTestId('icon-bot')).toBeDefined();
    expect(screen.getByTestId('icon-bot').parentElement?.parentElement).toHaveAttribute(
      'data-tooltip-content',
      'AI working...',
    );
  });

  it('does not show a separate system indicator', () => {
    vi.mocked(LogState.useState).mockReturnValue(
      makeLogState({ isSystemProcessing: true, isAIProcessing: false }),
    );
    const { container } = render(<WorkingIndicator />);
    expect(container.firstChild).toBeNull();
  });
});
