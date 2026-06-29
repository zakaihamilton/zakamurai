import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PromptComposer from './PromptComposer';

vi.mock('@/components/ui/Tooltip/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: { Close: () => <span />, Send: () => <span /> },
}));
vi.mock('@/utils/os', () => ({ formatShortcut: (s) => s }));

describe('PromptComposer', () => {
  it('renders textarea with placeholder', () => {
    render(
      <PromptComposer
        value=""
        onChange={vi.fn()}
        onKeyDown={vi.fn()}
        onSubmit={vi.fn((e) => e.preventDefault())}
        onStop={vi.fn()}
        isAIProcessing={false}
        isButtonActive={true}
        isOpen={true}
      />,
    );
    expect(screen.getByPlaceholderText('Enter the AI prompt here...')).toBeDefined();
  });

  it('shows stop button when AI processing', () => {
    render(
      <PromptComposer
        value=""
        onChange={vi.fn()}
        onKeyDown={vi.fn()}
        onSubmit={vi.fn()}
        onStop={vi.fn()}
        isAIProcessing={true}
        isButtonActive={false}
        isOpen={true}
      />,
    );
    expect(screen.getByPlaceholderText(/AI is working/)).toBeDefined();
  });

  it('submits form', () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <PromptComposer
        value="hello"
        onChange={vi.fn()}
        onKeyDown={vi.fn()}
        onSubmit={onSubmit}
        onStop={vi.fn()}
        isAIProcessing={false}
        isButtonActive={true}
        isOpen={true}
      />,
    );
    fireEvent.submit(document.querySelector('form'));
    expect(onSubmit).toHaveBeenCalled();
  });
});
