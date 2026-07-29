import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PromptHeader from './Header';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Icons', () => ({ Icons: { Brain: () => <span /> } }));

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
    expect(screen.getByText('AI Working')).toBeDefined();
    expect(screen.getByText('Compiling')).toBeDefined();
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
