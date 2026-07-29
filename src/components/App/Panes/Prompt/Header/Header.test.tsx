import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PromptHeader from './Header';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: { Brain: () => <span />, Copy: () => <span />, Check: () => <span /> },
}));

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(),
  },
  writable: true,
});

describe('PromptHeader', () => {
  it('renders title and status indicators', () => {
    render(
      <PromptHeader
        isAIProcessing={true}
        isSystemProcessing={true}
        hasReasoning={false}
        isReasoningVisible={false}
        onToggleReasoning={vi.fn()}
      />,
    );
    expect(screen.getByText('Agent')).toBeDefined();
    expect(screen.getByText('Compiling')).toBeDefined();
  });

  it('copies full session content to clipboard when copy button is clicked', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(
      <PromptHeader
        isAIProcessing={false}
        isSystemProcessing={false}
        hasReasoning={false}
        isReasoningVisible={false}
        onToggleReasoning={vi.fn()}
        copyContent={'--- Transcript ---\nHello world'}
      />,
    );

    const copyBtn = screen.getByRole('button', {
      name: 'Copy full session transcript and reasoning to clipboard',
    });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('--- Transcript ---\nHello world');
  });

  it('toggles reasoning visibility', () => {
    const onToggleReasoning = vi.fn();
    render(
      <PromptHeader
        isAIProcessing={false}
        isSystemProcessing={false}
        hasReasoning={true}
        isReasoningVisible={false}
        onToggleReasoning={onToggleReasoning}
      />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onToggleReasoning).toHaveBeenCalled();
  });

  it('switches agent mode', () => {
    const onModeChange = vi.fn();
    render(
      <PromptHeader
        isAIProcessing={false}
        isSystemProcessing={false}
        hasReasoning={false}
        isReasoningVisible={false}
        onToggleReasoning={vi.fn()}
        mode="single"
        onModeChange={onModeChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Team' }));
    expect(onModeChange).toHaveBeenCalledWith('team');
  });
});
