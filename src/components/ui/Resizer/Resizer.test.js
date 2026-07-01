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
});
