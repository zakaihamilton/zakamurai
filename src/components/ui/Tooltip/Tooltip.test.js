import { AppState } from '@/components/App/AppState';
import { useShouldShowKeyboardShortcuts } from '@/utils/keyboard';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Tooltip from './Tooltip';

vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/utils/keyboard', () => ({
  useShouldShowKeyboardShortcuts: vi.fn(() => true),
}));

describe('Tooltip', () => {
  beforeEach(() => {
    vi.spyOn(AppState, 'useState').mockReturnValue({ theme: 'dark' });
    useShouldShowKeyboardShortcuts.mockReturnValue(true);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const showTooltip = async (trigger) => {
    fireEvent.mouseEnter(trigger);
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it('renders children', () => {
    render(
      <Tooltip content="Helper text">
        <button type="button">Hover me</button>
      </Tooltip>,
    );
    expect(screen.getByText('Hover me')).toBeDefined();
  });

  it('shows tooltip after delay on mouse enter', async () => {
    render(
      <Tooltip content="Helper text" shortcut="⌘S">
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me').parentElement;
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole('tooltip')).toBeDefined();
    expect(screen.getByText('Helper text')).toBeDefined();
    expect(screen.getByText('⌘S')).toBeDefined();
  });

  it('renders multiline tooltip content with a styled header', async () => {
    render(
      <Tooltip content={'Token Breakdown\nsrc/test.js'}>
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    await showTooltip(screen.getByText('Hover me').parentElement);

    expect(screen.getByText('Token Breakdown')).toBeDefined();
    expect(screen.getByText('src/test.js')).toBeDefined();
  });

  it('keeps visibility isolated per instance', async () => {
    render(
      <>
        <Tooltip content="First helper">
          <button type="button">First</button>
        </Tooltip>
        <Tooltip content="Second helper">
          <button type="button">Second</button>
        </Tooltip>
      </>,
    );

    await showTooltip(screen.getByText('First').parentElement);

    expect(screen.getByText('First helper')).toBeDefined();
    expect(screen.queryByText('Second helper')).toBeNull();
  });

  it('hides shortcut labels when keyboard shortcuts should not be shown', async () => {
    useShouldShowKeyboardShortcuts.mockReturnValue(false);

    render(
      <Tooltip content="Helper text" shortcut="⌘S">
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    await showTooltip(screen.getByText('Hover me').parentElement);

    expect(screen.getByRole('tooltip')).toBeDefined();
    expect(screen.getByText('Helper text')).toBeDefined();
    expect(screen.queryByText('⌘S')).toBeNull();
  });

  it('hides tooltip on mouse leave', async () => {
    render(
      <Tooltip content="Helper text">
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me').parentElement;
    await showTooltip(trigger);
    expect(screen.getByRole('tooltip')).toBeDefined();

    await act(async () => {
      fireEvent.mouseLeave(trigger);
      await Promise.resolve();
      await Promise.resolve();
    });
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

  it('keeps tooltip inside viewport bounds near window edges', async () => {
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

    await showTooltip(trigger);

    const tooltip = screen.getByRole('tooltip');

    expect(tooltip.style.getPropertyValue('--tooltip-left')).toBe('70px');
    expect(tooltip.style.getPropertyValue('--tooltip-top')).toBe('24px');
    expect(tooltip.style.getPropertyValue('--tooltip-max-width')).toBe('120px');
    expect(tooltip.style.getPropertyValue('--tooltip-max-height')).toBe('70px');
  });
});
