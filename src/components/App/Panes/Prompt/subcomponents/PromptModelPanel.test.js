import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PromptModelPanel from './PromptModelPanel';

vi.mock('@/components/ui/Tooltip/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Select', () => ({
  default: ({ label, value, options, onChange, disabled }) => (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock('@/components/ui/Icons', () => ({ Icons: { Info: () => <span /> } }));

describe('PromptModelPanel', () => {
  const selectedModelInfo = {
    id: 'model-a',
    requirement: 'WebGPU required',
  };

  it('renders model select and summary', () => {
    render(
      <PromptModelPanel
        selectedModelInfo={selectedModelInfo}
        modelOptions={[{ value: 'model-a', label: 'Model A' }]}
        onChangeModel={vi.fn()}
        onLoadCachedModelIds={vi.fn()}
        onOpenModelManager={vi.fn()}
        isAIProcessing={false}
        isOpen={true}
      />,
    );

    expect(screen.getByLabelText('Model')).toBeDefined();
    expect(screen.getByText('WebGPU required')).toBeDefined();
    expect(screen.getByText('model-a')).toBeDefined();
  });

  it('opens model manager', () => {
    const onOpenModelManager = vi.fn();
    render(
      <PromptModelPanel
        selectedModelInfo={selectedModelInfo}
        modelOptions={[{ value: 'model-a', label: 'Model A' }]}
        onChangeModel={vi.fn()}
        onLoadCachedModelIds={vi.fn()}
        onOpenModelManager={onOpenModelManager}
        isAIProcessing={false}
        isOpen={true}
      />,
    );

    fireEvent.click(screen.getByLabelText('Manage AI models'));
    expect(onOpenModelManager).toHaveBeenCalled();
  });
});
