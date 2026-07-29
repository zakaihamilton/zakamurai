import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ContextMenu from './ContextMenu';

describe('ContextMenu', () => {
  it('renders children at correct position', () => {
    const position = { x: 100, y: 200 };
    render(
      <ContextMenu position={position} onClose={vi.fn()}>
        <button type="button">Option 1</button>
      </ContextMenu>,
    );

    const menu = screen.getByRole('menu');
    expect(menu.style.getPropertyValue('--menu-top')).toBe('200px');
    expect(menu.style.getPropertyValue('--menu-left')).toBe('100px');
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(
      <ContextMenu position={{ x: 0, y: 0 }} onClose={onClose}>
        <button type="button">Option</button>
      </ContextMenu>,
    );

    // Find overlay by class (since it has no text/role)
    const overlay = screen.getByRole('presentation');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not render when position is null', () => {
    const { container } = render(
      <ContextMenu position={null} onClose={vi.fn()}>
        <button type="button">Option</button>
      </ContextMenu>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onClose when overlay receives Enter/Escape keydown', () => {
    const onClose = vi.fn();
    render(
      <ContextMenu position={{ x: 0, y: 0 }} onClose={onClose}>
        <button type="button">Option</button>
      </ContextMenu>,
    );

    const overlay = screen.getByRole('presentation');
    fireEvent.keyDown(overlay, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(overlay, { key: 'Enter' });
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(overlay, { key: 'ArrowDown' });
    expect(onClose).toHaveBeenCalledTimes(2); // should not close
  });

  it('calls onClose and prevents default on overlay right-click', () => {
    const onClose = vi.fn();
    render(
      <ContextMenu position={{ x: 0, y: 0 }} onClose={onClose}>
        <button type="button">Option</button>
      </ContextMenu>,
    );

    const overlay = screen.getByRole('presentation');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    fireEvent(overlay, event);
    expect(onClose).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });
});
