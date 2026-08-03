import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ViewSwitcher from './ViewSwitcher';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Code: () => <span />,
    Terminal: () => <span />,
    Globe: () => <span />,
    ChevronDown: () => <span />,
  },
}));

describe('ViewSwitcher', () => {
  it('selects code and preview views and dismisses the menu', () => {
    const onOpenCode = vi.fn();
    const onOpenPreview = vi.fn();

    render(
      <ViewSwitcher
        activeView="Logs"
        canOpenCode
        onOpenCode={onOpenCode}
        onOpenLog={vi.fn()}
        onOpenPreview={onOpenPreview}
      />,
    );

    fireEvent.click(screen.getByTestId('mobile-view-switcher'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Code' }));
    expect(onOpenCode).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('mobile-view-switcher'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Preview' }));
    expect(onOpenPreview).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('mobile-view-switcher'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(screen.getByTestId('mobile-view-switcher'));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('disables code when no content tab is available', () => {
    render(
      <ViewSwitcher
        activeView="Preview"
        canOpenCode={false}
        onOpenCode={vi.fn()}
        onOpenLog={vi.fn()}
        onOpenPreview={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('mobile-view-switcher'));
    expect(screen.getByRole('menuitem', { name: 'Code' })).toBeDisabled();
  });
});
