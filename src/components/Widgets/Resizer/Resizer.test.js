import { createState } from '@/components/Core/Base/State';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Resizer from './Resizer';

vi.mock('@/components/Core/Base/State', () => {
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
});
