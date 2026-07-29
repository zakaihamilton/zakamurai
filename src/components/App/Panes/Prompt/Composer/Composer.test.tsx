import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PromptComposer from './Composer';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: { Close: () => <span />, Info: () => <span />, Send: () => <span /> },
}));
vi.mock('@/components/ui/Select', () => ({
  default: ({ label, value, options = [], onChange }) => (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
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
    expect(screen.getByPlaceholderText('Tell the Agent what to do...')).toBeDefined();
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
    expect(screen.getByPlaceholderText(/Agent is working/)).toBeDefined();
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

  it('changes the model from the embedded selector', () => {
    const onChangeModel = vi.fn();
    render(
      <PromptComposer
        value=""
        onChange={vi.fn()}
        onKeyDown={vi.fn()}
        onSubmit={vi.fn()}
        onStop={vi.fn()}
        isAIProcessing={false}
        isButtonActive={false}
        isOpen={true}
        selectedModelInfo={{ id: 'model-a' }}
        modelOptions={[
          { value: 'model-a', label: 'Model A' },
          { value: 'model-b', label: 'Model B' },
        ]}
        onChangeModel={onChangeModel}
      />,
    );

    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'model-b' } });
    expect(onChangeModel).toHaveBeenCalledWith('model-b');
  });
});
