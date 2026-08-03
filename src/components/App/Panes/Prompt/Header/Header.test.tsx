import type { ManagerTrace } from '@/components/AI/Agent';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PromptHeader from './Header';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Brain: () => <span />,
    Copy: () => <span />,
    Check: () => <span />,
    Terminal: () => <span />,
  },
}));

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(),
  },
  writable: true,
});

describe('PromptHeader', () => {
  it('renders title and status indicators', () => {
    render(<PromptHeader isAIProcessing={true} isSystemProcessing={true} />);
    expect(screen.getByText('AI Manager')).toBeDefined();
    expect(screen.getByText('Compiling')).toBeDefined();
  });

  it('copies full session content to clipboard when copy button is clicked', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(
      <PromptHeader
        isAIProcessing={false}
        isSystemProcessing={false}
        copyContent={'--- Transcript ---\nHello world'}
      />,
    );

    const copyBtn = screen.getByRole('button', {
      name: 'Copy full session transcript and reasoning to clipboard',
    });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('--- Transcript ---\nHello world');
  });

  it('does not expose agent mode controls', () => {
    render(<PromptHeader isAIProcessing={false} isSystemProcessing={false} />);
    expect(screen.queryByRole('button', { name: 'Team' })).toBeNull();
  });

  it('places the manager trace trigger in the header action row', () => {
    const trace: ManagerTrace = {
      version: 1,
      runId: 'header-trace',
      request: 'create a todo app',
      startedAt: 100,
      endedAt: 125,
      durationMs: 25,
      outcome: 'success' as const,
      events: [],
    };

    const { container } = render(
      <PromptHeader isAIProcessing={false} isSystemProcessing={false} latestManagerTrace={trace} />,
    );

    const traceButton = screen.getByRole('button', {
      name: 'Open manager debug trace (success)',
    });
    const headerActions = container.querySelector('[class*="headerActions"]');
    expect(headerActions?.contains(traceButton)).toBe(true);
  });
});
