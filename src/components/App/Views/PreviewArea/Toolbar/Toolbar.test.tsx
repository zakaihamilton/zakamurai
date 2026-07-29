import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PreviewToolbar from './Toolbar';

describe('PreviewToolbar', () => {
  const noopHandlers = {
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onZoomReset: vi.fn(),
    onRefresh: vi.fn(),
    onOpenExternal: vi.fn(),
    onToggleMaximize: vi.fn(),
  };

  it('renders toolbar with label and loading indicator', () => {
    const { rerender } = render(
      <PreviewToolbar
        previewHostLabel="http://localhost:3001"
        isLoading={true}
        scale={1}
        isMaximized={false}
        {...noopHandlers}
      />,
    );
    expect(screen.getByText('http://localhost:3001/')).toBeDefined();

    rerender(
      <PreviewToolbar
        previewHostLabel="http://localhost:3001"
        isLoading={false}
        scale={1}
        isMaximized={true}
        {...noopHandlers}
      />,
    );
  });

  it('triggers action handlers on button clicks', () => {
    const handlers = {
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
      onZoomReset: vi.fn(),
      onRefresh: vi.fn(),
      onOpenExternal: vi.fn(),
      onToggleMaximize: vi.fn(),
    };

    render(
      <PreviewToolbar
        previewHostLabel="http://localhost:3001"
        isLoading={false}
        scale={1.5}
        isMaximized={false}
        {...handlers}
      />,
    );

    expect(screen.getByText('150%')).toBeDefined();
    fireEvent.click(screen.getByText('150%'));
    expect(handlers.onZoomReset).toHaveBeenCalled();

    fireEvent.click(screen.getByText('+'));
    expect(handlers.onZoomIn).toHaveBeenCalled();

    fireEvent.click(screen.getByText('−'));
    expect(handlers.onZoomOut).toHaveBeenCalled();
  });
});
