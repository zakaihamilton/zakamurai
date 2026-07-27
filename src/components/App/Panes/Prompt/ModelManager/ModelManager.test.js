import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import ModelManager from './index';

// Mock Dialog widget to keep tests focused
vi.mock('@/components/ui/Dialog', () => ({
  default: ({ children, isOpen, title, message, onConfirm, onCancel, confirmText, cancelText }) => {
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
  default: ({ children }) => <div>{children}</div>,
}));

describe('ModelManager', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ModelManager
        isOpen={false}
        selectedModelId="Llama-3-8B-Instruct-q4f16_1"
        onCancel={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders models list with appropriate badges', () => {
    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3.5-4B-q4f16_1-MLC"
        cachedModelIds={['Qwen3.5-4B-q4f16_1-MLC']}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('AI Models')).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Qwen3.5 4B selected' }).checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Qwen3.5 9B selected' }).checked).toBe(false);
    expect(screen.getByRole('columnheader', { name: /Model/ })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /Best for/ })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /RAM/ })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /Storage/ })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /Speed/ })).toBeDefined();
    expect(screen.queryByRole('columnheader', { name: /Status/ })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Cache' })).toBeDefined();
    expect(screen.getByText('3.87 GB')).toBeDefined();
    expect(screen.getByText('2.39 GB')).toBeDefined();
  });

  it('filters models across model details and status, and clears the search', () => {
    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3.5-4B-q4f16_1-MLC"
        cachedModelIds={['Qwen3.5-4B-q4f16_1-MLC']}
        onCancel={vi.fn()}
      />,
    );

    const search = screen.getByRole('searchbox', { name: 'Search AI models' });
    fireEvent.change(search, { target: { value: 'lower-memory' } });
    expect(screen.getByText('Qwen3.5 2B')).toBeDefined();
    expect(screen.queryByText('Qwen3.5 9B')).toBeNull();

    fireEvent.change(search, { target: { value: 'cached' } });
    expect(screen.getByText('Qwen3.5 4B')).toBeDefined();
    expect(screen.queryByText('Qwen3.5 2B')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear model search' }));
    expect(screen.getByText('Qwen3.5 9B')).toBeDefined();
  });

  it('sorts columns in ascending and descending order with aria-sort', () => {
    render(
      <ModelManager isOpen={true} selectedModelId="Qwen3.5-4B-q4f16_1-MLC" onCancel={vi.fn()} />,
    );

    const modelHeader = screen.getByRole('columnheader', { name: /Model/ });
    expect(modelHeader.getAttribute('aria-sort')).toBe('none');
    fireEvent.click(screen.getByRole('button', { name: /Model/ }));
    expect(modelHeader.getAttribute('aria-sort')).toBe('ascending');
    let rows = screen.getAllByRole('row').slice(1);
    expect(rows[0].textContent).toContain('Qwen2.5 Coder 3B');

    fireEvent.click(screen.getByRole('button', { name: /Model/ }));
    expect(modelHeader.getAttribute('aria-sort')).toBe('descending');
    rows = screen.getAllByRole('row').slice(1);
    expect(rows[0].textContent).toContain('Qwen3.5 9B');
  });

  it('shows an empty state when no models match', () => {
    render(<ModelManager isOpen={true} selectedModelId="" onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search AI models' }), {
      target: { value: 'does-not-exist' },
    });
    expect(screen.getByText('No AI models match your search.')).toBeDefined();
  });

  it('triggers onModelCacheAction when cache/uncache button clicked', () => {
    const onModelCacheAction = vi.fn();
    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3.5-4B-q4f16_1-MLC"
        cachedModelIds={[]}
        onModelCacheAction={onModelCacheAction}
        onCancel={vi.fn()}
      />,
    );

    const cacheButtons = screen.getAllByRole('button', { name: /Cache/ });
    fireEvent.click(cacheButtons[0]);
    expect(onModelCacheAction).toHaveBeenCalled();
  });

  it('requires confirmation before removing a cached model', () => {
    const onModelCacheAction = vi.fn();
    render(
      <ModelManager
        isOpen={true}
        selectedModelId=""
        cachedModelIds={['Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC']}
        onModelCacheAction={onModelCacheAction}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cached' }));
    expect(screen.getByRole('heading', { name: 'Remove cached model?' })).toBeDefined();
    expect(screen.getByText(/Qwen2.5 Coder 7B will need to be downloaded again/)).toBeDefined();
    expect(onModelCacheAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Keep cached' }));
    expect(screen.queryByRole('heading', { name: 'Remove cached model?' })).toBeNull();
    expect(onModelCacheAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cached' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove cache' }));
    expect(onModelCacheAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC' }),
      'uncache',
    );
  });

  it('displays progress or error status message', () => {
    render(
      <ModelManager
        isOpen={true}
        selectedModelId="Qwen3.5-4B-q4f16_1-MLC"
        cachedModelIds={[]}
        onCancel={vi.fn()}
        modelCacheProgress="Downloading: 50%"
      />,
    );

    expect(screen.getByText('Downloading: 50%')).toBeDefined();
  });
});
