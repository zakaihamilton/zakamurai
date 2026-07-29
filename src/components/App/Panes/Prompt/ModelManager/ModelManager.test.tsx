import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ModelManager from './index';

const defaultModelManagerProps = {
  modelCacheWork: null,
  modelCacheProgress: '',
  modelCacheError: '',
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
  }: {
    children?: ReactNode;
    isOpen?: boolean;
    title?: ReactNode;
    message?: ReactNode;
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmText?: ReactNode;
    cancelText?: ReactNode;
  }) => {
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

vi.mock('@/components/ui/Tooltip', () => ({
  __esModule: true,
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

describe('ModelManager', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ModelManager
        isOpen={false}
        selectedModelId="Llama-3-8B-Instruct-q4f16_1"
        onCancel={vi.fn()}
        {...defaultModelManagerProps}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('opens the model manager dialog with searchable content', () => {
    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3.5-4B-q4f16_1-MLC"
        cachedModelIds={['Qwen3.5-4B-q4f16_1-MLC']}
        onCancel={vi.fn()}
        {...defaultModelManagerProps}
      />,
    );

    expect(screen.getByText('AI Models')).toBeDefined();
    expect(screen.getByRole('searchbox', { name: 'Search models' })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Cache' })).toBeDefined();
  });

  it('displays progress or error status message', () => {
    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3.5-4B-q4f16_1-MLC"
        cachedModelIds={[]}
        onCancel={vi.fn()}
        modelCacheProgress="Downloading: 50%"
        modelCacheWork={null}
        modelCacheError=""
      />,
    );

    expect(screen.getByText('Downloading: 50%')).toBeDefined();
  });
});
