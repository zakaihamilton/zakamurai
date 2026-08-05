import { requireElement } from '@/test-utils/domMocks';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ChangeEvent, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PromptComposer from './Composer';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: { Close: () => <span />, Info: () => <span />, Send: () => <span /> },
}));
vi.mock('@/components/ui/Select', () => ({
  default: ({
    label,
    value,
    options = [],
    onChange,
  }: {
    label: string;
    value: string;
    options?: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label={label}
      value={value}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock('@/utils/os', () => ({ formatShortcut: (s: string) => s }));

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
    expect(screen.getByPlaceholderText('Tell the AI Manager what to do...')).toBeDefined();
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
    expect(screen.getByPlaceholderText(/AI Manager is working/)).toBeDefined();
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
    const form = document.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(requireElement(form));
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

  it('exposes explicit prompt modes', () => {
    const onChangePromptMode = vi.fn();
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
        promptMode="ask"
        onChangePromptMode={onChangePromptMode}
      />,
    );

    const mode = screen.getByLabelText('Mode');
    expect(mode).toBeDefined();
    fireEvent.change(mode, { target: { value: 'edit' } });
    expect(onChangePromptMode).toHaveBeenCalledWith('edit');
  });
});
