import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PromptHeader from './PromptHeader';

vi.mock('@/components/ui/Tooltip/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
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
    expect(screen.getByText('AI Prompt')).toBeDefined();
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
    fireEvent.click(screen.getByRole('button'));
    expect(onToggleReasoning).toHaveBeenCalled();
  });
});
