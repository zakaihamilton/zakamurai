import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { StateStore } from 'triactor';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import Resizer from './Resizer';

const { mockUseState, mockStateComponent } = vi.hoisted(() => {
  const mockUseState = vi.fn();
  const mockStateComponent = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  Object.assign(mockStateComponent, { useState: mockUseState });
  return { mockUseState, mockStateComponent };
});

vi.mock('triactor', () => ({
  createState: vi.fn(() => mockStateComponent),
}));

type ResizerState = { isResizing: boolean };

function mockResizerState(updater: Mock, state: ResizerState): StateStore<ResizerState> & Mock {
  return Object.assign(updater, state) as StateStore<ResizerState> & Mock;
}

describe('Resizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onResizeStart when mouse is pressed', () => {
    const onResizeStart = vi.fn();
    const resizerStateUpdater = vi.fn();
    mockUseState.mockReturnValue(mockResizerState(resizerStateUpdater, { isResizing: false }));

    const { container } = render(<Resizer onResizeStart={onResizeStart} onResize={() => {}} />);
    const resizer = container.firstChild as HTMLElement;

    fireEvent.mouseDown(resizer);
    expect(onResizeStart).toHaveBeenCalled();
    expect(resizerStateUpdater).toHaveBeenCalled();
  });

  it('calls onDoubleClick when double clicked', () => {
    const onDoubleClick = vi.fn();
    mockUseState.mockReturnValue(mockResizerState(vi.fn(), { isResizing: false }));

    const { container } = render(<Resizer onDoubleClick={onDoubleClick} onResize={() => {}} />);
    const resizer = container.firstChild as HTMLElement;

    fireEvent.doubleClick(resizer);
    expect(onDoubleClick).toHaveBeenCalled();
  });

  it('handles mouse and touch resizing while active', () => {
    const onResize = vi.fn();
    const onResizeEnd = vi.fn();
    const resizerStateUpdater = vi.fn((callback) => callback({ isResizing: true }));
    mockUseState.mockReturnValue(mockResizerState(resizerStateUpdater, { isResizing: true }));

    const { container } = render(<Resizer onResize={onResize} onResizeEnd={onResizeEnd} />);
    expect((container.firstChild as HTMLElement).className).toContain('resizing');

    fireEvent.mouseMove(window, { clientX: 125 });
    fireEvent.touchMove(window, { touches: [{ clientX: 240 }] });
    fireEvent.mouseUp(window);

    expect(onResize).toHaveBeenNthCalledWith(1, 125);
    expect(onResize).toHaveBeenNthCalledWith(2, 240);
    expect(onResizeEnd).toHaveBeenCalledOnce();
    expect(resizerStateUpdater).toHaveBeenCalled();
  });

  it('ignores double-click mouse downs when starting a resize', () => {
    const onResize = vi.fn();
    const resizerStateUpdater = vi.fn();
    mockUseState.mockReturnValue(mockResizerState(resizerStateUpdater, { isResizing: true }));

    const { container } = render(<Resizer onResize={onResize} />);
    fireEvent.mouseDown(container.firstChild as Element, { detail: 2 });

    expect(onResize).not.toHaveBeenCalled();
    expect(resizerStateUpdater).not.toHaveBeenCalled();
  });

  it('supports omitted lifecycle callbacks', () => {
    const resizerStateUpdater = vi.fn((callback) => callback({ isResizing: true }));
    const state = mockResizerState(resizerStateUpdater, { isResizing: false });
    mockUseState.mockReturnValue(state);
    const { container, rerender } = render(<Resizer onResize={() => {}} />);

    fireEvent.mouseDown(container.firstChild as Element);
    state.isResizing = true;
    rerender(<Resizer onResize={() => {}} />);
    fireEvent.mouseUp(window);

    expect(resizerStateUpdater).toHaveBeenCalledTimes(2);
  });

  it('supports keyboard resizing with separator semantics', () => {
    const onResize = vi.fn();
    mockUseState.mockReturnValue(mockResizerState(vi.fn(), { isResizing: false }));
    render(<Resizer onResize={onResize} value={300} min={240} max={600} label="Resize sidebar" />);

    const resizer = screen.getByRole('separator', { name: 'Resize sidebar' });
    expect(resizer).toHaveAttribute('aria-valuenow', '300');
    fireEvent.keyDown(resizer, { key: 'ArrowRight' });
    fireEvent.keyDown(resizer, { key: 'Home' });
    expect(onResize).toHaveBeenNthCalledWith(1, 316);
    expect(onResize).toHaveBeenNthCalledWith(2, 240);
  });

  it('supports left/end/shift keyboard resizing and null state defaults', () => {
    const onResize = vi.fn();
    mockUseState.mockReturnValue(null);
    render(<Resizer onResize={onResize} value={300} min={240} max={600} label="Resize sidebar" />);

    const resizer = screen.getByRole('separator', { name: 'Resize sidebar' });
    fireEvent.keyDown(resizer, { key: 'ArrowLeft' });
    fireEvent.keyDown(resizer, { key: 'ArrowLeft', shiftKey: true });
    fireEvent.keyDown(resizer, { key: 'End' });
    fireEvent.keyDown(resizer, { key: 'Enter' });

    expect(onResize).toHaveBeenNthCalledWith(1, 284);
    expect(onResize).toHaveBeenNthCalledWith(2, 252);
    expect(onResize).toHaveBeenNthCalledWith(3, 600);
    expect(onResize).toHaveBeenCalledTimes(3);
  });

  it('disables interactions and applies collapsed class when isCollapsed, disabled, or hidden className is present', () => {
    const onResizeStart = vi.fn();
    const onDoubleClick = vi.fn();
    const onResize = vi.fn();
    const resizerStateUpdater = vi.fn();
    mockUseState.mockReturnValue(mockResizerState(resizerStateUpdater, { isResizing: false }));

    const { container, rerender } = render(
      <Resizer
        onResizeStart={onResizeStart}
        onDoubleClick={onDoubleClick}
        onResize={onResize}
        isCollapsed={true}
        label="Resize panel"
      />,
    );

    const resizer = container.firstChild as HTMLElement;
    expect(resizer.className).toContain('collapsed');
    expect(resizer).toHaveAttribute('aria-disabled', 'true');

    fireEvent.mouseDown(resizer);
    fireEvent.doubleClick(resizer);
    fireEvent.keyDown(resizer, { key: 'ArrowRight' });

    expect(onResizeStart).not.toHaveBeenCalled();
    expect(onDoubleClick).not.toHaveBeenCalled();
    expect(onResize).not.toHaveBeenCalled();

    rerender(
      <Resizer
        onResizeStart={onResizeStart}
        onDoubleClick={onDoubleClick}
        onResize={onResize}
        className="hidden"
        label="Resize panel"
      />,
    );

    fireEvent.mouseDown(container.firstChild as Element);
    expect(onResizeStart).not.toHaveBeenCalled();
  });
});
