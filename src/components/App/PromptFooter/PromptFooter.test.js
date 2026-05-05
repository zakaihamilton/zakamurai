import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ZakamuraiState } from '../State';
import PromptFooter from './PromptFooter';

vi.mock('../State', () => ({
  ZakamuraiState: {
    useState: vi.fn(),
  },
}));

describe('PromptFooter', () => {
  it('renders input and button when showAIInput is true', () => {
    ZakamuraiState.useState.mockReturnValue({
      showAIInput: true,
      isProcessing: false,
    });

    render(<PromptFooter />);
    expect(screen.getByPlaceholderText('Command the Scaffolder...')).toBeDefined();
    expect(screen.getByText('Execute')).toBeDefined();
  });

  it('does not render when showAIInput is false', () => {
    ZakamuraiState.useState.mockReturnValue({
      showAIInput: false,
    });

    const { container } = render(<PromptFooter />);
    expect(container.firstChild).toBeNull();
  });

  it('calls state update when form is submitted', () => {
    const stateUpdate = vi.fn();
    ZakamuraiState.useState.mockReturnValue(
      Object.assign(stateUpdate, {
        showAIInput: true,
        isProcessing: false,
        logs: [],
      }),
    );

    render(<PromptFooter />);
    const input = screen.getByPlaceholderText('Command the Scaffolder...');
    const button = screen.getByText('Execute');

    fireEvent.change(input, { target: { value: 'build app' } });
    fireEvent.click(button);

    expect(stateUpdate).toHaveBeenCalled();
  });
});
