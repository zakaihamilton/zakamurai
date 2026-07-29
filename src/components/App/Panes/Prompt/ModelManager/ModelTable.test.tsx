import { WEB_LLM_MODELS } from '@/components/AI/WebLLMModels';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModelTable from './ModelTable';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    ChevronUp: () => <span>up</span>,
    ChevronDown: () => <span>down</span>,
  },
}));

const defaultProps = {
  modelCacheWork: null,
  onToggleSort: vi.fn(),
  onModelCacheAction: vi.fn(),
  onRequestUncache: vi.fn(),
};

describe('ModelTable', () => {
  const models = WEB_LLM_MODELS.slice(0, 3);

  it('renders model rows with selected and cached badges', () => {
    render(
      <ModelTable
        {...defaultProps}
        visibleModels={models}
        sort={null}
        selectedModelId={models[0].id}
        cachedModelIds={[models[1].id]}
      />,
    );

    expect(
      (screen.getByRole('checkbox', { name: `${models[0].name} selected` }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(screen.getByRole('columnheader', { name: /Model/ })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Cache' })).toBeDefined();
    expect(screen.getByText(models[0].name)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Remove from cache' })).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'Cache model' }).length).toBeGreaterThan(0);
  });

  it('toggles sort direction and exposes aria-sort', () => {
    const onToggleSort = vi.fn();
    const { rerender } = render(
      <ModelTable
        {...defaultProps}
        visibleModels={models}
        sort={null}
        onToggleSort={onToggleSort}
        selectedModelId=""
      />,
    );

    const modelHeader = screen.getByRole('columnheader', { name: /Model/ });
    expect(modelHeader.getAttribute('aria-sort')).toBe('none');

    fireEvent.click(screen.getByRole('button', { name: /Model/ }));
    expect(onToggleSort).toHaveBeenCalledWith('model');

    rerender(
      <ModelTable
        {...defaultProps}
        visibleModels={models}
        sort={{ key: 'model', direction: 'ascending' }}
        onToggleSort={onToggleSort}
        selectedModelId=""
      />,
    );
    expect(modelHeader.getAttribute('aria-sort')).toBe('ascending');

    rerender(
      <ModelTable
        {...defaultProps}
        visibleModels={models}
        sort={{ key: 'model', direction: 'descending' }}
        onToggleSort={onToggleSort}
        selectedModelId=""
      />,
    );
    expect(modelHeader.getAttribute('aria-sort')).toBe('descending');
  });

  it('renders an empty state when no models are visible', () => {
    render(<ModelTable {...defaultProps} visibleModels={[]} sort={null} selectedModelId="" />);

    expect(screen.getByText('No AI models match your search.')).toBeDefined();
  });

  it('routes cache and uncache actions through callbacks', () => {
    const onModelCacheAction = vi.fn();
    const onRequestUncache = vi.fn();

    render(
      <ModelTable
        {...defaultProps}
        visibleModels={models}
        sort={null}
        selectedModelId=""
        cachedModelIds={[models[0].id]}
        onModelCacheAction={onModelCacheAction}
        onRequestUncache={onRequestUncache}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Cache model' })[0]);
    expect(onModelCacheAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: models[1].id }),
      'cache',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove from cache' }));
    expect(onRequestUncache).toHaveBeenCalledWith(expect.objectContaining({ id: models[0].id }));
  });
});
