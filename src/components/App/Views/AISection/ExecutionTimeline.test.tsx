import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createIdleAgentActivity,
  createRunningAgentActivity,
  node,
} from '@/components/AI/Agent/AgentActivityNodes';
import { requireElement } from '@/test-utils/domMocks';
import type { AgentActivityState } from '@/types/domain-types';
import ExecutionTimeline from './ExecutionTimeline';

const createMockAnimation = (rejectFinish = false) =>
  ({
    cancel: vi.fn(),
    finished: rejectFinish ? Promise.reject(new Error('cancelled')) : Promise.resolve(),
  }) as unknown as Animation;

const buildSampleActivity = (): AgentActivityState => ({
  ...createRunningAgentActivity('Build UI'),
  currentPhase: 'work',
  currentNodeId: 'plan-0',
  nodes: [
    node({
      id: 'request',
      phase: 'request',
      kind: 'request',
      label: 'Request',
      status: 'completed',
      detail: 'Build UI',
    }),
    node({
      id: 'plan-0',
      phase: 'work',
      kind: 'tool',
      label: 'Read source',
      status: 'active',
      detail: 'Reading src/App.tsx',
      tool: 'read_file',
      input: 'src/App.tsx',
      output: 'export default function App() {}',
    }),
    node({
      id: 'plan-1',
      phase: 'validation',
      kind: 'validation',
      label: 'Validate changes',
      status: 'queued',
      detail: 'Up next: Verify build',
    }),
    node({
      id: 'result',
      phase: 'result',
      kind: 'result',
      label: 'Ready',
      status: 'queued',
      detail: 'Waiting for completion',
    }),
  ],
});

let originalAnimate: typeof HTMLElement.prototype.animate;
let originalScrollTo: typeof HTMLElement.prototype.scrollTo;
let originalMatchMedia: typeof window.matchMedia;

beforeEach(() => {
  originalAnimate = HTMLElement.prototype.animate;
  originalScrollTo = HTMLElement.prototype.scrollTo;
  originalMatchMedia = window.matchMedia;
  HTMLElement.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  HTMLElement.prototype.animate = originalAnimate;
  HTMLElement.prototype.scrollTo = originalScrollTo;
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe('ExecutionTimeline', () => {
  it('renders empty state when there are no nodes or model progress', () => {
    render(
      <ExecutionTimeline
        activity={createIdleAgentActivity()}
        timelineExpanded={false}
        showStepIO={false}
      />,
    );

    expect(screen.getByText('No timeline cards')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous timeline card' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next timeline card' })).toBeDisabled();
    expect(
      screen.getByRole('list', { name: 'Collapsed execution card deck' }).children,
    ).toHaveLength(0);
  });

  it('includes model progress card, supports empty modelName fallback, and yields working focus to active nodes', () => {
    const { rerender } = render(
      <ExecutionTimeline
        activity={createIdleAgentActivity()}
        modelProgress={{ modelName: '', progress: 0.25, detail: 'Fetching shard' }}
        timelineExpanded={false}
        showStepIO={false}
      />,
    );

    expect(screen.getByText('Card 1 of 1: Loading model')).toBeInTheDocument();
    const modelCard = requireElement(document.querySelector('[data-card-id="model-progress"]'));
    expect(modelCard).toHaveAttribute('data-card-working', 'true');
    expect(modelCard).toHaveAttribute('data-card-selected', 'true');

    rerender(
      <ExecutionTimeline
        activity={buildSampleActivity()}
        modelProgress={{ modelName: 'Qwen-Coder', progress: 1, detail: 'Loaded' }}
        timelineExpanded={false}
        showStepIO={true}
      />,
    );

    // Collapsed mode hides queued cards, reorders working card (plan-0) to the end
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-card-id]'));
    expect(cards.map((card) => card.dataset.cardId)).toEqual([
      'model-progress',
      'request',
      'plan-0',
    ]);
    expect(screen.getByText('Card 3 of 3: Read source')).toBeInTheDocument();
    expect(screen.getByText('src/App.tsx')).toBeInTheDocument();
    expect(screen.getByText('export default function App() {}')).toBeInTheDocument();
  });

  it('navigates collapsed and expanded cards and resets selection when active card or expansion changes', async () => {
    const animations: ReturnType<typeof createMockAnimation>[] = [];
    const animateMock = vi.fn(() => {
      const anim = createMockAnimation(animations.length === 0);
      animations.push(anim);
      return anim;
    });
    HTMLElement.prototype.animate = animateMock;

    const { rerender } = render(
      <ExecutionTimeline
        activity={buildSampleActivity()}
        timelineExpanded={false}
        showStepIO={false}
      />,
    );

    const prevButton = screen.getByRole('button', { name: 'Previous timeline card' });
    const nextButton = screen.getByRole('button', { name: 'Next timeline card' });

    expect(screen.getByText('Card 2 of 2: Read source')).toBeInTheDocument();
    expect(nextButton).toBeDisabled();

    // Move backward in collapsed deck -> slices cardRenderOrder up to request
    fireEvent.click(prevButton);
    expect(screen.getByText('Card 1 of 2: Request')).toBeInTheDocument();
    expect(prevButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();
    expect(animateMock).toHaveBeenCalledTimes(1);

    // Move forward in collapsed deck -> both incoming and outgoing cards animate
    fireEvent.click(nextButton);
    expect(screen.getByText('Card 2 of 2: Read source')).toBeInTheDocument();
    expect(animateMock).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(animations[1]?.cancel).toHaveBeenCalled());

    // Active node fallback when currentNodeId points to a completed node
    const staleCurrentActivity: AgentActivityState = {
      ...buildSampleActivity(),
      currentNodeId: 'request',
    };
    rerender(
      <ExecutionTimeline
        activity={staleCurrentActivity}
        timelineExpanded={false}
        showStepIO={false}
      />,
    );
    expect(screen.getByText('Card 2 of 2: Read source')).toBeInTheDocument();

    // Switch to expanded mode -> all 4 nodes (including queued) become visible
    rerender(
      <ExecutionTimeline
        activity={buildSampleActivity()}
        timelineExpanded={true}
        showStepIO={false}
      />,
    );
    const expandedList = screen.getByRole('list', { name: 'Expanded execution cards' });
    expect(expandedList.className).toContain('executionMapExpanded');
    expect(screen.getByText('Card 2 of 4: Read source')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-card-id]')).toHaveLength(4);
    expect(requireElement(document.querySelector('[data-card-id="plan-1"]'))).not.toHaveAttribute(
      'aria-hidden',
    );

    // Fall back to last card when no node is active
    const completedActivity: AgentActivityState = {
      ...buildSampleActivity(),
      outcome: 'success',
      currentNodeId: 'plan-0',
      nodes: buildSampleActivity().nodes.map((item) => ({ ...item, status: 'completed' as const })),
    };
    rerender(
      <ExecutionTimeline activity={completedActivity} timelineExpanded={true} showStepIO={false} />,
    );
    expect(screen.getByText('Card 4 of 4: Ready')).toBeInTheDocument();
  });

  it('runs FLIP animations on mode change and skips them when deltas are small or reduced motion is preferred', () => {
    const animations: ReturnType<typeof createMockAnimation>[] = [];
    const animateMock = vi.fn(() => {
      const anim = createMockAnimation();
      animations.push(anim);
      return anim;
    });
    HTMLElement.prototype.animate = animateMock;

    let rectLeft = 10;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          left: rectLeft,
          top: 0,
          width: 240,
          height: 120,
          right: rectLeft + 240,
          bottom: 120,
          x: rectLeft,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    );

    const { rerender, unmount } = render(
      <ExecutionTimeline
        activity={buildSampleActivity()}
        timelineExpanded={false}
        showStepIO={false}
      />,
    );

    // Move cards horizontally on mode switch -> triggers FLIP animation
    rectLeft = 180;
    rerender(
      <ExecutionTimeline
        activity={buildSampleActivity()}
        timelineExpanded={true}
        showStepIO={false}
      />,
    );
    expect(animateMock).toHaveBeenCalled();

    // No rect change -> skips FLIP animation
    const callsBeforeZeroDelta = animateMock.mock.calls.length;
    rerender(
      <ExecutionTimeline
        activity={buildSampleActivity()}
        timelineExpanded={false}
        showStepIO={false}
      />,
    );
    expect(animateMock.mock.calls.length).toBe(callsBeforeZeroDelta);

    // Reduced motion enabled -> skips FLIP animation even with rect delta
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    rectLeft = 360;
    rerender(
      <ExecutionTimeline
        activity={buildSampleActivity()}
        timelineExpanded={true}
        showStepIO={false}
      />,
    );
    expect(animateMock.mock.calls.length).toBe(callsBeforeZeroDelta);

    unmount();
    expect(
      animations.some((anim) => (anim.cancel as ReturnType<typeof vi.fn>).mock.calls.length > 0),
    ).toBe(true);
  });

  it('auto-scrolls expanded timeline to center selected card with smooth or auto behavior', () => {
    const scrollToMock = vi.fn();
    HTMLElement.prototype.scrollTo = scrollToMock;

    const { rerender } = render(
      <ExecutionTimeline
        activity={buildSampleActivity()}
        timelineExpanded={false}
        showStepIO={false}
      />,
    );

    const mapEl = requireElement(document.querySelector('ol'));
    Object.defineProperties(mapEl, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 1_200 },
      scrollLeft: { configurable: true, value: 0, writable: true },
    });
    const selectedCard = requireElement(document.querySelector('[data-card-id="plan-0"]'));
    Object.defineProperties(selectedCard, {
      offsetLeft: { configurable: true, value: 500 },
      offsetWidth: { configurable: true, value: 200 },
    });

    rerender(
      <ExecutionTimeline
        activity={buildSampleActivity()}
        timelineExpanded={true}
        showStepIO={false}
      />,
    );
    expect(scrollToMock).toHaveBeenCalledWith({ left: 450, behavior: 'smooth' });

    // Moving to next card with reduced motion uses 'auto' behavior
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    const nextCard = requireElement(document.querySelector('[data-card-id="plan-1"]'));
    Object.defineProperties(nextCard, {
      offsetLeft: { configurable: true, value: 800 },
      offsetWidth: { configurable: true, value: 200 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next timeline card' }));
    expect(scrollToMock).toHaveBeenCalledWith({ left: 750, behavior: 'auto' });

    // If scrollLeft is already at target, scrollTo is not called again
    scrollToMock.mockClear();
    Object.defineProperty(mapEl, 'scrollLeft', { configurable: true, value: 750, writable: true });
    rerender(
      <ExecutionTimeline
        activity={buildSampleActivity()}
        timelineExpanded={true}
        showStepIO={true}
      />,
    );
    expect(scrollToMock).not.toHaveBeenCalled();
  });
});
