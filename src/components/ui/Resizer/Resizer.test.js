import { createState } from '@/components/state/State';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Resizer from './Resizer';

vi.mock('@/components/state/State', () => {
  const mockState = ({ children }) => <div>{children}</div>;
  mockState.useState = vi.fn();
  return {
    createState: vi.fn(() => mockState),
  };
});

describe('Resizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onResizeStart when mouse is pressed', () => {
    const onResizeStart = vi.fn();
    const resizerStateUpdater = vi.fn();
    const resizerStateMock = Object.assign(resizerStateUpdater, { isResizing: false });
    createState().useState.mockReturnValue(resizerStateMock);

    const { container } = render(<Resizer onResizeStart={onResizeStart} onResize={() => {}} />);
    const resizer = container.firstChild;

    fireEvent.mouseDown(resizer);
    expect(onResizeStart).toHaveBeenCalled();
    expect(resizerStateUpdater).toHaveBeenCalled();
  });

  it('calls onDoubleClick when double clicked', () => {
    const onDoubleClick = vi.fn();
    const resizerStateMock = Object.assign(vi.fn(), { isResizing: false });
    createState().useState.mockReturnValue(resizerStateMock);

    const { container } = render(<Resizer onDoubleClick={onDoubleClick} onResize={() => {}} />);
    const resizer = container.firstChild;

    fireEvent.doubleClick(resizer);
    expect(onDoubleClick).toHaveBeenCalled();
  });

  it('handles mouse and touch resizing while active', () => {
    const onResize = vi.fn();
    const onResizeEnd = vi.fn();
    const resizerStateUpdater = vi.fn((callback) => callback({ isResizing: true }));
    createState().useState.mockReturnValue(
      Object.assign(resizerStateUpdater, { isResizing: true }),
    );

    const { container } = render(<Resizer onResize={onResize} onResizeEnd={onResizeEnd} />);
    expect(container.firstChild.className).toContain('resizing');

    fireEvent.mouseMove(window, { clientX: 125 });
    fireEvent.touchMove(window, { touches: [{ clientX: 240 }] });
    fireEvent.mouseUp(window);

    expect(onResize).toHaveBeenNthCalledWith(1, 125);
    expect(onResize).toHaveBeenNthCalledWith(2, 240);
    expect(onResizeEnd).toHaveBeenCalledOnce();
    expect(resizerStateUpdater).toHaveBeenCalled();
  });

  it('ignores incomplete resize events and double-click mouse downs', () => {
    const onResize = vi.fn();
    const resizerStateUpdater = vi.fn();
    createState().useState.mockReturnValue(
      Object.assign(resizerStateUpdater, { isResizing: true }),
    );

    const { container } = render(<Resizer onResize={onResize} />);
    fireEvent.mouseMove(window);
    fireEvent.mouseDown(container.firstChild, { detail: 2 });

    expect(onResize).not.toHaveBeenCalled();
    expect(resizerStateUpdater).not.toHaveBeenCalled();
  });

  it('supports omitted lifecycle callbacks', () => {
    const resizerStateUpdater = vi.fn((callback) => callback({ isResizing: true }));
    const state = Object.assign(resizerStateUpdater, { isResizing: false });
    createState().useState.mockReturnValue(state);
    const { container, rerender } = render(<Resizer onResize={() => {}} />);

    fireEvent.mouseDown(container.firstChild);
    state.isResizing = true;
    rerender(<Resizer onResize={() => {}} />);
    fireEvent.mouseUp(window);

    expect(resizerStateUpdater).toHaveBeenCalledTimes(2);
  });

  it('supports keyboard resizing with separator semantics', () => {
    const onResize = vi.fn();
    createState().useState.mockReturnValue(Object.assign(vi.fn(), { isResizing: false }));
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
    createState().useState.mockReturnValue(null);
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
    createState().useState.mockReturnValue(
      Object.assign(resizerStateUpdater, { isResizing: false }),
    );

    const { container, rerender } = render(
      <Resizer
        onResizeStart={onResizeStart}
        onDoubleClick={onDoubleClick}
        onResize={onResize}
        isCollapsed={true}
        label="Resize panel"
      />,
    );

    const resizer = container.firstChild;
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

    fireEvent.mouseDown(container.firstChild);
    expect(onResizeStart).not.toHaveBeenCalled();
  });
});
