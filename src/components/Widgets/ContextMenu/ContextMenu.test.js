import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ContextMenu from './ContextMenu';

describe('ContextMenu', () => {
  it('renders children at correct position', () => {
    const position = { x: 100, y: 200 };
    render(
      <ContextMenu position={position} onClose={vi.fn()}>
        <button type="button">Option 1</button>
      </ContextMenu>
    );
    
    const menu = screen.getByText('Option 1').closest('div');
    expect(menu.style.top).toBe('200px');
    expect(menu.style.left).toBe('100px');
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ContextMenu position={{ x: 0, y: 0 }} onClose={onClose}>
        <button type="button">Option</button>
      </ContextMenu>
    );
    
    // Find overlay by class (since it has no text/role)
    const overlay = container.querySelector('[class*="overlay"]');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not render when position is null', () => {
    const { container } = render(
      <ContextMenu position={null} onClose={vi.fn()}>
        <button type="button">Option</button>
      </ContextMenu>
    );
    expect(container.firstChild).toBeNull();
  });
});
