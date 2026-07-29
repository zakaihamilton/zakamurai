import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModelCacheToggle from './ModelCacheToggle';

describe('ModelCacheToggle', () => {
  it('shows cache, cached, and working labels', () => {
    const { rerender } = render(
      <ModelCacheToggle isCached={false} isBusy={false} disabled={false} onToggle={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Cache model' })).toBeDefined();

    rerender(
      <ModelCacheToggle isCached={true} isBusy={false} disabled={false} onToggle={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Remove from cache' })).toBeDefined();

    rerender(
      <ModelCacheToggle isCached={false} isBusy={true} disabled={false} onToggle={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Cache model' })).toHaveProperty('disabled', true);
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(
      <ModelCacheToggle isCached={false} isBusy={false} disabled={false} onToggle={onToggle} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cache model' }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('does not toggle when disabled', () => {
    const onToggle = vi.fn();
    render(
      <ModelCacheToggle isCached={false} isBusy={false} disabled={true} onToggle={onToggle} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cache model' }));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
