import { AppState } from '@/components/App/AppState';
import { makeAppState } from '@/test-utils/stateMocks';
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

function getTrigger(label: string): HTMLElement {
  const el = screen.getByText(label).parentElement;
  if (!el) throw new Error(`missing trigger for ${label}`);
  return el;
}

type RectLike = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
  x: number;
  y: number;
  toJSON?: () => void;
};

function asDomRect(rect: RectLike): DOMRect {
  return {
    ...rect,
    toJSON: rect.toJSON ?? (() => ({})),
  } as DOMRect;
}

function mockRects(trigger: Element, triggerRect: RectLike, tooltipRect?: RectLike) {
  const triggerDomRect = asDomRect(triggerRect);
  const tooltipDomRect = asDomRect(tooltipRect ?? triggerRect);
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(triggerDomRect);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.getAttribute('role') === 'tooltip') return tooltipDomRect;
    return triggerDomRect;
  });
}

describe('Tooltip', () => {
  beforeEach(() => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ theme: 'dark' }));
    vi.mocked(useShouldShowKeyboardShortcuts).mockReturnValue(true);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const showTooltip = async (trigger: Element) => {
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

  it('returns children directly when content is empty', () => {
    const { container } = render(
      <Tooltip content="">
        <button type="button">No tooltip</button>
      </Tooltip>,
    );

    expect(screen.getByText('No tooltip')).toBeDefined();
    expect(container.querySelector('[class]')).toBeNull();
  });

  it('renders React content without treating it as a multiline header', async () => {
    render(
      <Tooltip content={<strong>Rich helper</strong>}>
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    await showTooltip(getTrigger('Hover me'));
    expect(screen.getByText('Rich helper').tagName).toBe('STRONG');
  });

  it('renders multiline text without a header when the first line is blank', async () => {
    render(
      <Tooltip content={'\nBody only'}>
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    await showTooltip(getTrigger('Hover me'));
    expect(screen.getByText(/Body only/)).toBeDefined();
    expect(document.querySelector('[class*="contentHeader"]')).toBeNull();
  });

  it('shows tooltip after delay on mouse enter', async () => {
    render(
      <Tooltip content="Helper text" shortcut="⌘S">
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    const trigger = getTrigger('Hover me');
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

  it('does not show a tooltip for suppressed initial focus', async () => {
    render(
      <Tooltip content="Helper text" suppressInitialFocus>
        <button type="button">Focus me</button>
      </Tooltip>,
    );

    const trigger = getTrigger('Focus me');
    fireEvent.focus(trigger);
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.blur(trigger);
    fireEvent.focus(trigger);
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(screen.getByRole('tooltip')).toBeDefined();
  });

  it('renders multiline tooltip content with a styled header', async () => {
    render(
      <Tooltip content={'Token Breakdown\nsrc/test.js'}>
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    await showTooltip(getTrigger('Hover me'));

    expect(screen.getByText('Token Breakdown')).toBeDefined();
    expect(screen.getByText('src/test.js')).toBeDefined();
  });

  it('preserves line breaks in multiline tooltip details', async () => {
    render(
      <Tooltip content={'Title\nFirst detail\nSecond detail'}>
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    await showTooltip(getTrigger('Hover me'));

    expect(screen.getByRole('tooltip').textContent).toContain('First detail\nSecond detail');
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

    await showTooltip(getTrigger('First'));

    expect(screen.getByText('First helper')).toBeDefined();
    expect(screen.queryByText('Second helper')).toBeNull();
  });

  it('hides shortcut labels when keyboard shortcuts should not be shown', async () => {
    vi.mocked(useShouldShowKeyboardShortcuts).mockReturnValue(false);

    render(
      <Tooltip content="Helper text" shortcut="⌘S">
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    await showTooltip(getTrigger('Hover me'));

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

    const trigger = getTrigger('Hover me');
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

    const trigger = getTrigger('Hover me');
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

    const trigger = getTrigger('Hover me');
    const triggerRect: RectLike = {
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
    const tooltipRect: RectLike = {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 121,
      height: 40,
      x: 0,
      y: 0,
      toJSON: () => {},
    };

    mockRects(trigger, triggerRect, tooltipRect);

    await showTooltip(trigger);

    const tooltip = screen.getByRole('tooltip');

    expect(tooltip.style.getPropertyValue('--tooltip-left')).toBe('70px');
    expect(tooltip.style.getPropertyValue('--tooltip-top')).toBe('24px');
    expect(tooltip.style.getPropertyValue('--tooltip-max-width')).toBe('120px');
    expect(tooltip.style.getPropertyValue('--tooltip-max-height')).toBe('70px');
  });

  it('positions a light tooltip above a centered trigger', async () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ theme: 'light' }));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });

    render(
      <Tooltip content={'Title\nDetails'} className="custom-tooltip-trigger">
        <button type="button">Focus me</button>
      </Tooltip>,
    );

    const trigger = getTrigger('Focus me');
    const triggerRect: RectLike = {
      top: 300,
      bottom: 320,
      left: 390,
      right: 410,
      width: 20,
      height: 20,
      x: 390,
      y: 300,
      toJSON: () => {},
    };
    const tooltipRect: RectLike = { ...triggerRect, width: 100, height: 30 };
    mockRects(trigger, triggerRect, tooltipRect);

    fireEvent.focus(trigger);
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    const tooltip = screen.getByRole('tooltip');
    expect(trigger.className).toContain('custom-tooltip-trigger');
    expect(tooltip.className).toContain('light');
    expect(tooltip.style.getPropertyValue('--tooltip-top')).toBe('300px');

    await act(async () => {
      fireEvent.blur(trigger);
      await Promise.resolve();
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('flips a tall tooltip below when there is more room there', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    render(
      <Tooltip content="Tall helper">
        <button type="button">Tall trigger</button>
      </Tooltip>,
    );

    const trigger = getTrigger('Tall trigger');
    const triggerRect: RectLike = {
      top: 150,
      bottom: 170,
      left: 200,
      right: 220,
      width: 20,
      height: 20,
      x: 200,
      y: 150,
      toJSON: () => {},
    };
    mockRects(trigger, triggerRect, { ...triggerRect, width: 100, height: 200 });

    await showTooltip(trigger);
    expect(screen.getByRole('tooltip').className).toContain('bottom');
  });

  it('repositions a visible tooltip when the viewport scrolls', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    render(
      <Tooltip content="Moving helper">
        <button type="button">Moving trigger</button>
      </Tooltip>,
    );

    const trigger = getTrigger('Moving trigger');
    let triggerRect: RectLike = {
      top: 300,
      bottom: 320,
      left: 390,
      right: 410,
      width: 20,
      height: 20,
      x: 390,
      y: 300,
      toJSON: () => {},
    };
    vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(() => asDomRect(triggerRect));
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return this.getAttribute('role') === 'tooltip'
        ? asDomRect({ ...triggerRect, width: 100, height: 30 })
        : asDomRect(triggerRect);
    });

    await showTooltip(trigger);
    triggerRect = { ...triggerRect, top: 200, bottom: 220, y: 200 };
    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
      await Promise.resolve();
    });

    expect(screen.getByRole('tooltip').style.getPropertyValue('--tooltip-top')).toBe('200px');
  });

  it('clamps dimensions and arrow placement in an extremely small viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 10 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 20 });
    render(
      <Tooltip content="Compact helper">
        <button type="button">Compact trigger</button>
      </Tooltip>,
    );

    const trigger = getTrigger('Compact trigger');
    const rect: RectLike = {
      top: 1,
      bottom: 2,
      left: 0,
      right: 2,
      width: 2,
      height: 1,
      x: 0,
      y: 1,
      toJSON: () => {},
    };
    mockRects(trigger, rect, { ...rect, width: 20, height: 10 });

    await showTooltip(trigger);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.style.getPropertyValue('--tooltip-max-width')).toBe('0px');
    expect(tooltip.style.getPropertyValue('--tooltip-max-height')).toBe('0px');
    expect(tooltip.style.getPropertyValue('--arrow-offset')).toBe('0px');
  });

  it('ensures only one tooltip is ever displayed at once', async () => {
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

    const firstTrigger = getTrigger('First');
    const secondTrigger = getTrigger('Second');

    await showTooltip(firstTrigger);
    expect(screen.getByText('First helper')).toBeDefined();
    expect(screen.queryByText('Second helper')).toBeNull();

    await showTooltip(secondTrigger);
    expect(screen.queryByText('First helper')).toBeNull();
    expect(screen.getByText('Second helper')).toBeDefined();
    expect(screen.getAllByRole('tooltip').length).toBe(1);
  });

  it('hides active tooltip on window blur and visibility change', async () => {
    render(
      <Tooltip content="Helper text">
        <button type="button">Hover me</button>
      </Tooltip>,
    );

    const trigger = getTrigger('Hover me');
    await showTooltip(trigger);
    expect(screen.getByRole('tooltip')).toBeDefined();

    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByRole('tooltip')).toBeNull();

    await showTooltip(trigger);
    expect(screen.getByRole('tooltip')).toBeDefined();

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
