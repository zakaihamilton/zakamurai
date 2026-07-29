import type { ReactNode } from 'react';
import { WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RemoveCacheDialog from './RemoveCacheDialog';

type DialogMockProps = {
  children?: ReactNode;
  isOpen?: boolean;
  title?: ReactNode;
  message?: ReactNode;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: ReactNode;
  cancelText?: ReactNode;
};

vi.mock('@/components/ui/Dialog', () => ({
  default: ({
    children,
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText,
    cancelText,
  }: DialogMockProps) => {
    if (!isOpen) return null;
    return (
      <div data-testid="dialog">
        <button type="button" onClick={onCancel}>
          {cancelText || 'Close Dialog'}
        </button>
        <h3>{title}</h3>
        {children || <p>{message}</p>}
        {onConfirm && (
          <button type="button" onClick={onConfirm}>
            {confirmText || 'Confirm'}
          </button>
        )}
      </div>
    );
  },
}));

describe('RemoveCacheDialog', () => {
  const model = WEB_LLM_MODELS[0];

  it('renders nothing when no model is pending removal', () => {
    const { container } = render(
      <RemoveCacheDialog model={null} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows confirmation copy and supports keep or remove actions', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(<RemoveCacheDialog model={model} onCancel={onCancel} onConfirm={onConfirm} />);

    expect(screen.getByRole('heading', { name: 'Remove cached model?' })).toBeDefined();
    expect(screen.getByText(/Remove ".*" from the local cache\?/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
