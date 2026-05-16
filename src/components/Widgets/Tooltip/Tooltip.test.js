import { AppState } from '@/components/App/AppState';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Tooltip from './Tooltip';

vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(),
  },
}));

describe('Tooltip', () => {
  beforeEach(() => {
    vi.spyOn(AppState, 'useState').mockReturnValue({ theme: 'dark' });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders children', () => {
    render(
      <Tooltip content="Helper text">
        <button type="button">Hover me</button>
      </Tooltip>,
    );
    expect(screen.getByText('Hover me')).toBeDefined();
  });

  it('shows tooltip after delay on mouse enter', () => {
    render(
      <Tooltip content="Helper text" shortcut="⌘S">
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me').parentElement;
    fireEvent.mouseEnter(trigger);

    // Should not be visible yet
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByRole('tooltip')).toBeDefined();
    expect(screen.getByText('Helper text')).toBeDefined();
    expect(screen.getByText('⌘S')).toBeDefined();
  });

  it('hides tooltip on mouse leave', () => {
    render(
      <Tooltip content="Helper text">
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me').parentElement;
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole('tooltip')).toBeDefined();

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hides tooltip immediately if mouse leaves before delay', () => {
    render(
      <Tooltip content="Helper text">
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me').parentElement;
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('keeps tooltip inside viewport bounds near window edges', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 140 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 100 });

    render(
      <Tooltip content="A helpful tooltip">
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me').parentElement;
    const triggerRect = {
      top: 4,
      bottom: 24,
      left: 0,
      right: 20,
      width: 20,
      height: 20,
      x: 0,
      y: 4,
      toJSON: () => {},
    };
    const tooltipRect = {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 120,
      height: 40,
      x: 0,
      y: 0,
      toJSON: () => {},
    };

    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(triggerRect);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function getRect() {
      if (this.getAttribute('role') === 'tooltip') return tooltipRect;
      return triggerRect;
    });

    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(400);
    });

    const tooltip = screen.getByRole('tooltip');

    expect(tooltip.style.left).toBe('70px');
    expect(tooltip.style.top).toBe('24px');
    expect(tooltip.style.maxWidth).toBe('120px');
    expect(tooltip.style.maxHeight).toBe('70px');
  });
});
