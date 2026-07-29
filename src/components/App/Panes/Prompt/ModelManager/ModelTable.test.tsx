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

describe('ModelTable', () => {
  const models = WEB_LLM_MODELS.slice(0, 3);

  it('renders model rows with selected and cached badges', () => {
    render(
      <ModelTable
        visibleModels={models}
        sort={null}
        onToggleSort={vi.fn()}
        selectedModelId={models[0].id}
        cachedModelIds={[models[1].id]}
        onModelCacheAction={vi.fn()}
        onRequestUncache={vi.fn()}
      />,
    );

    expect(screen.getByRole('checkbox', { name: `${models[0].name} selected` }).checked).toBe(true);
    expect(screen.getByRole('columnheader', { name: /Model/ })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Cache' })).toBeDefined();
    expect(screen.getByText(models[0].name)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cached' })).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'Cache' }).length).toBeGreaterThan(0);
  });

  it('toggles sort direction and exposes aria-sort', () => {
    const onToggleSort = vi.fn();
    const { rerender } = render(
      <ModelTable
        visibleModels={models}
        sort={null}
        onToggleSort={onToggleSort}
        selectedModelId=""
        onModelCacheAction={vi.fn()}
        onRequestUncache={vi.fn()}
      />,
    );

    const modelHeader = screen.getByRole('columnheader', { name: /Model/ });
    expect(modelHeader.getAttribute('aria-sort')).toBe('none');

    fireEvent.click(screen.getByRole('button', { name: /Model/ }));
    expect(onToggleSort).toHaveBeenCalledWith('model');

    rerender(
      <ModelTable
        visibleModels={models}
        sort={{ key: 'model', direction: 'ascending' }}
        onToggleSort={onToggleSort}
        selectedModelId=""
        onModelCacheAction={vi.fn()}
        onRequestUncache={vi.fn()}
      />,
    );
    expect(modelHeader.getAttribute('aria-sort')).toBe('ascending');

    rerender(
      <ModelTable
        visibleModels={models}
        sort={{ key: 'model', direction: 'descending' }}
        onToggleSort={onToggleSort}
        selectedModelId=""
        onModelCacheAction={vi.fn()}
        onRequestUncache={vi.fn()}
      />,
    );
    expect(modelHeader.getAttribute('aria-sort')).toBe('descending');
  });

  it('renders an empty state when no models are visible', () => {
    render(
      <ModelTable
        visibleModels={[]}
        sort={null}
        onToggleSort={vi.fn()}
        selectedModelId=""
        onModelCacheAction={vi.fn()}
        onRequestUncache={vi.fn()}
      />,
    );

    expect(screen.getByText('No AI models match your search.')).toBeDefined();
  });

  it('routes cache and uncache actions through callbacks', () => {
    const onModelCacheAction = vi.fn();
    const onRequestUncache = vi.fn();

    render(
      <ModelTable
        visibleModels={models}
        sort={null}
        onToggleSort={vi.fn()}
        selectedModelId=""
        cachedModelIds={[models[0].id]}
        onModelCacheAction={onModelCacheAction}
        onRequestUncache={onRequestUncache}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Cache' })[0]);
    expect(onModelCacheAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: models[1].id }),
      'cache',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cached' }));
    expect(onRequestUncache).toHaveBeenCalledWith(expect.objectContaining({ id: models[0].id }));
  });
});
