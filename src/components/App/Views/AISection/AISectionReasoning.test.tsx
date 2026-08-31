import {
  applyManagerPlan,
  createRunningAgentActivity,
  finishAgentActivity,
} from '@/components/AI/Agent/AgentActivity';
import type { ManagerPlan } from '@/components/AI/types';
import { createAgentRunUsage } from '@/components/App/Panes/Prompt/AgentSessions';
import { makeAgentSession } from '@/test-utils/agentSessionMocks';
import type { AgentActivityState } from '@/types/domain-types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AISectionReasoning, { getLiveExecutionInfo } from './AISectionReasoning';
import type { ReasoningGroup } from './AISectionReasoning';

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

const groups: ReasoningGroup[] = [
  {
    step: null,
    entries: [{ text: '**Routing:** deciding what to do', timestamp: '10:00:00' }],
  },
  {
    step: 1,
    entries: [
      {
        text: 'Reading the workspace',
        timestamp: '10:00:01',
        input: 'list_files input',
        output: 'list_files output',
      },
      { text: '**Validation:** passed', timestamp: '10:00:02' },
    ],
  },
];

const plan: ManagerPlan = {
  intent: 'edit',
  modelRequired: true,
  confidence: 'high',
  steps: [
    { kind: 'tool', tool: 'read_file', reason: 'Inspect the existing implementation.' },
    { kind: 'model', task: 'generate-changes', reason: 'Produce the requested update.' },
    { kind: 'tool', tool: 'validate', reason: 'Check the result before presenting it.' },
  ],
};

const activityBase = applyManagerPlan(createRunningAgentActivity('Build the app'), plan);
const activity: AgentActivityState = {
  ...activityBase,
  currentPhase: 'work',
  currentNodeId: 'plan-0',
  nodes: activityBase.nodes.map((item) =>
    item.id === 'plan-0'
      ? {
          ...item,
          status: 'active' as const,
          detail: 'Reading the workspace source now.',
          input: 'list_files input',
          output: 'list_files output',
        }
      : item,
  ),
};

const streamedGenerationDetail =
  'Local model is responding — streaming its next action (2,718 character(s) received). Waiting for complete source code before validation…';

const generationActivity: AgentActivityState = {
  ...activity,
  currentPhase: 'work',
  currentNodeId: 'plan-1',
  nodes: activity.nodes.map((item) =>
    item.id === 'plan-0'
      ? { ...item, status: 'completed' as const, detail: 'Workspace source loaded.' }
      : item.id === 'plan-1'
        ? { ...item, status: 'active' as const, detail: streamedGenerationDetail }
        : item,
  ),
};

const createProps = (overrides: Partial<React.ComponentProps<typeof AISectionReasoning>> = {}) => ({
  activeSession: makeAgentSession({
    status: 'running',
    messages: [{ id: 1, role: 'user', text: 'Build the app', timestamp: '10:00:00' }],
    runUsage: {
      ...createAgentRunUsage(),
      modelCalls: 2,
      totalMs: 1250,
      toolCalls: { list_files: 1 },
    },
  }),
  reasoningGroups: groups,
  visualReasoningGroups: groups,
  activity,
  viewType: 'visual' as const,
  showStepIO: false,
  runUsageSummary: '',
  latestError: '',
  fallbackContent: 'No progress or reasoning to show yet.',
  content: 'text content',
  contentRef: createRef<HTMLDivElement>(),
  onUserScroll: vi.fn(),
  ...overrides,
});

describe('AISectionReasoning', () => {
  it('renders the live execution map with planned future work', () => {
    const { rerender } = render(<AISectionReasoning {...createProps()} />);

    const executionRegion = screen.getByRole('region', { name: 'Execution timeline' });

    expect(screen.getByRole('region', { name: 'Run overview' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Live execution' })).toHaveTextContent('Read source');
    expect(executionRegion).toBeDefined();

    const collapsedNodes = [...executionRegion.querySelectorAll('li')];
    expect(collapsedNodes).toHaveLength(3);
    expect(collapsedNodes.at(-1)).toHaveTextContent('Read source');
    expect(collapsedNodes.some((node) => node.textContent?.includes('Generate changes'))).toBe(
      false,
    );
    expect(collapsedNodes.some((node) => node.textContent?.includes('Validate changes'))).toBe(
      false,
    );

    rerender(<AISectionReasoning {...createProps({ timelineExpanded: true })} />);
    const nodes = [...executionRegion.querySelectorAll('li')];
    expect(nodes[0]).toHaveTextContent('Request');
    expect(nodes[1]).toHaveTextContent('Route');
    expect(nodes[2]).toHaveTextContent('Gather context');
    expect(
      nodes.map((node) => node.querySelector('span[class*="executionTitle"]')?.textContent),
    ).toEqual([
      'Request',
      'Route',
      'Gather context',
      'Read source',
      'Generate changes',
      'Validate changes',
      'Ready',
    ]);
    expect(nodes.every((node) => !node.hasAttribute('data-depth'))).toBe(true);
    expect(nodes.every((node) => !node.hasAttribute('data-rotation'))).toBe(true);
    expect(nodes.every((node) => node.querySelector('[class*="executionCardArt"]'))).toBe(true);
    expect(nodes.every((node) => node.querySelector('[class*="executionCardArtIcon"]'))).toBe(true);
    expect(nodes.find((node) => node.getAttribute('aria-current') === 'step')).toHaveTextContent(
      'Read source',
    );
    expect(nodes.find((node) => node.getAttribute('aria-current') === 'step')?.className).toContain(
      'executionNodeactive',
    );
    expect(nodes.find((node) => node.getAttribute('aria-current') === 'step')?.className).toContain(
      'executionNodeWorking',
    );
    expect(nodes.every((node) => node.querySelector('[class*="executionDetail"]'))).toBe(true);
    expect(screen.getAllByText('Working').length).toBeGreaterThan(0);
    expect(screen.getByText('Model calls')).toBeDefined();
    expect(screen.getAllByText('Read source').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Generate changes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Validate changes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Up next').length).toBeGreaterThan(0);
    expect(screen.queryByRole('region', { name: 'Session transcript' })).toBeNull();
    expect(screen.getAllByText('Build the app').length).toBeGreaterThan(0);
  });

  it('renders model loading as a progress card with determinate and fallback rings', () => {
    const { rerender } = render(
      <AISectionReasoning
        {...createProps({
          modelProgress: {
            modelName: 'Qwen local model',
            progress: 0.5,
            detail: 'Fetching model weights…',
          },
        })}
      />,
    );

    const progressbar = screen.getByRole('progressbar', { name: 'Loading Qwen local model' });
    expect(progressbar).toHaveAttribute('aria-valuenow', '50');
    expect(progressbar).toHaveAttribute('aria-valuetext', '50%');
    expect(screen.getByText('Fetching model weights…')).toBeDefined();
    expect(progressbar.closest('li')).toBe(
      screen
        .getByRole('region', { name: 'Execution timeline' })
        .querySelector('[data-card-id="model-progress"]'),
    );

    rerender(
      <AISectionReasoning
        {...createProps({
          modelProgress: {
            modelName: 'Qwen local model',
            progress: null,
            detail: 'Initializing…',
          },
        })}
      />,
    );

    expect(
      screen.getByRole('progressbar', { name: 'Loading Qwen local model' }),
    ).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText('Initializing…')).toBeDefined();
  });

  it('renders active change generation as a live streaming card', () => {
    const { rerender } = render(
      <AISectionReasoning {...createProps({ activity: generationActivity })} />,
    );

    const executionRegion = screen.getByRole('region', { name: 'Execution timeline' });
    const generationNode = executionRegion.querySelector('[data-card-id="plan-1"]');

    expect(generationNode).toHaveAttribute('data-card-variant', 'live-generation');
    expect(generationNode).toHaveAttribute('data-card-working', 'true');
    expect(generationNode).toHaveTextContent('Generate changes');
    expect(generationNode).toHaveTextContent('Generating changes');
    expect(generationNode).toHaveTextContent('2,718');
    expect(generationNode).toHaveTextContent('characters received');
    expect(generationNode).toHaveTextContent('Waiting for complete source');
    expect(generationNode).toHaveTextContent('Live model output');
    const generationSummary = generationNode?.querySelector('output[aria-live="polite"]');
    expect(generationSummary).toHaveAttribute('aria-live', 'polite');
    expect(generationSummary).toHaveAttribute('aria-atomic', 'true');
    expect(generationSummary).not.toHaveTextContent(streamedGenerationDetail);
    const generationDetails = generationNode?.querySelector('details');
    expect(generationDetails).not.toHaveAttribute('open');
    expect(generationDetails).toHaveTextContent(streamedGenerationDetail);
    expect(generationNode?.querySelector('[class*="executionCardArtGeneration"]')).toBeTruthy();
    expect(generationNode?.querySelector('[role="progressbar"]')).toBeNull();
    expect(
      generationNode?.querySelector('[class*="executionGenerationDetailsIcon"] svg'),
    ).toBeTruthy();

    if (!generationDetails) throw new Error('Expected generation details disclosure.');
    const generationDetailsSummary = generationDetails.querySelector('summary');
    if (!generationDetailsSummary) throw new Error('Expected generation details summary.');
    fireEvent.click(generationDetailsSummary);
    expect(generationDetails).toHaveAttribute('open');
    expect(generationDetails.querySelector('p')).toHaveTextContent(streamedGenerationDetail);

    rerender(
      <AISectionReasoning
        {...createProps({ activity: generationActivity, timelineExpanded: true })}
      />,
    );
    expect(
      screen
        .getByRole('region', { name: 'Execution timeline' })
        .querySelector('[data-card-id="plan-1"]'),
    ).toHaveAttribute('data-card-variant', 'live-generation');
  });

  it('uses safe visual fallbacks when generation detail has no character count', () => {
    const fallbackDetail =
      'Local model is still working (3s elapsed; the model has not started streaming yet; keeping the workspace context ready)…';
    const fallbackActivity: AgentActivityState = {
      ...generationActivity,
      nodes: generationActivity.nodes.map((item) =>
        item.id === 'plan-1' ? { ...item, detail: fallbackDetail } : item,
      ),
    };

    render(<AISectionReasoning {...createProps({ activity: fallbackActivity })} />);

    const generationNode = screen
      .getByRole('region', { name: 'Execution timeline' })
      .querySelector('[data-card-id="plan-1"]');
    const generationSummary = generationNode?.querySelector('output[aria-live="polite"]');

    expect(generationSummary).toHaveTextContent('…');
    expect(generationSummary).toHaveTextContent('receiving output');
    expect(generationSummary).toHaveTextContent('Waiting for output to finish');
    expect(generationNode?.querySelector('details')).toHaveTextContent(fallbackDetail);
  });

  it('keeps non-active and terminal model cards on the generic treatment', () => {
    const { rerender } = render(
      <AISectionReasoning {...createProps({ timelineExpanded: true })} />,
    );
    const executionRegion = screen.getByRole('region', { name: 'Execution timeline' });

    expect(executionRegion.querySelector('[data-card-id="plan-1"]')).not.toHaveAttribute(
      'data-card-variant',
    );

    const completedGeneration = finishAgentActivity(
      generationActivity,
      'success',
      'Changes are ready for review.',
      2_000,
    );
    rerender(
      <AISectionReasoning
        {...createProps({ activity: completedGeneration, timelineExpanded: true })}
      />,
    );
    expect(executionRegion.querySelector('[data-card-id="plan-1"]')).not.toHaveAttribute(
      'data-card-variant',
    );

    const failedGeneration = finishAgentActivity(
      generationActivity,
      'error',
      'Generation failed.',
      2_000,
    );
    rerender(
      <AISectionReasoning
        {...createProps({ activity: failedGeneration, timelineExpanded: true })}
      />,
    );
    expect(executionRegion.querySelector('[data-card-id="plan-1"]')).not.toHaveAttribute(
      'data-card-variant',
    );
  });

  it('switches between the layered deck and horizontal card rail', () => {
    const { rerender } = render(<AISectionReasoning {...createProps()} />);
    const executionRegion = screen.getByRole('region', { name: 'Execution timeline' });
    const cardMap = executionRegion.querySelector('ol');

    expect(cardMap?.className).toContain('executionMapCollapsed');
    expect(cardMap?.getAttribute('aria-label')).toBe('Collapsed execution card deck');

    rerender(<AISectionReasoning {...createProps({ timelineExpanded: true })} />);

    const expandedMap = screen
      .getByRole('region', { name: 'Execution timeline' })
      .querySelector('ol');
    expect(expandedMap?.className).toContain('executionMapExpanded');
    expect(expandedMap?.getAttribute('aria-label')).toBe('Expanded execution cards');
  });

  it('navigates the collapsed deck with previous and next controls', () => {
    const { rerender } = render(<AISectionReasoning {...createProps()} />);

    const executionRegion = screen.getByRole('region', { name: 'Execution timeline' });
    const previous = screen.getByRole('button', { name: 'Previous timeline card' });
    const next = screen.getByRole('button', { name: 'Next timeline card' });
    const selectedCardId = () =>
      executionRegion.querySelector('[data-card-selected="true"]')?.getAttribute('data-card-id');

    expect(selectedCardId()).toBe('plan-0');
    expect(previous).not.toBeDisabled();
    expect(next).toBeDisabled();

    fireEvent.click(previous);
    fireEvent.click(previous);
    fireEvent.click(previous);
    expect(selectedCardId()).toBe('request');
    expect(previous).toBeDisabled();

    const completedActivity = finishAgentActivity(
      activity,
      'success',
      'Everything is ready.',
      2_000,
    );
    rerender(<AISectionReasoning {...createProps({ activity: completedActivity })} />);
    expect(selectedCardId()).toBe('result');
    expect(next).toBeDisabled();

    fireEvent.click(previous);
    expect(selectedCardId()).toBe('plan-2');
    fireEvent.click(next);
    expect(selectedCardId()).toBe('result');

    const lastNode = activity.nodes.at(-1);
    if (!lastNode) throw new Error('Expected the fixture activity to have a result node.');
    const latestActivity: AgentActivityState = {
      ...activity,
      nodes: [
        ...activity.nodes,
        {
          ...lastNode,
          id: 'latest',
          label: 'Latest result',
          status: 'active',
          detail: 'The newest card is ready.',
        },
      ],
      currentNodeId: 'latest',
    };
    rerender(<AISectionReasoning {...createProps({ activity: latestActivity })} />);
    expect(selectedCardId()).toBe('latest');

    const middleActivity: AgentActivityState = {
      ...activity,
      currentNodeId: 'plan-2',
      nodes: activity.nodes.map((item) =>
        item.id === 'plan-2'
          ? { ...item, status: 'active' as const, detail: 'Validating the generated changes.' }
          : item.id === 'plan-0'
            ? { ...item, status: 'completed' as const }
            : item,
      ),
    };
    rerender(<AISectionReasoning {...createProps({ activity: middleActivity })} />);
    expect(selectedCardId()).toBe('plan-2');
    expect(executionRegion.querySelector('[data-card-id="plan-2"]')).toHaveAttribute(
      'data-card-working',
      'true',
    );
    expect(executionRegion.querySelector('[data-card-id="result"]')).toBeNull();
    expect(executionRegion.querySelector('li:last-child')).toHaveAttribute(
      'data-card-id',
      'plan-2',
    );

    const fallbackActivity: AgentActivityState = {
      ...middleActivity,
      currentNodeId: 'plan-2',
      nodes: middleActivity.nodes.map((item) =>
        item.id === 'plan-2'
          ? { ...item, status: 'completed' as const }
          : item.id === 'plan-1'
            ? { ...item, status: 'active' as const }
            : item,
      ),
    };
    rerender(<AISectionReasoning {...createProps({ activity: fallbackActivity })} />);
    expect(selectedCardId()).toBe('plan-1');
    const fallbackCollapsedIds = [...executionRegion.querySelectorAll('li')].map((node) =>
      node.getAttribute('data-card-id'),
    );
    expect(fallbackCollapsedIds.at(-2)).toBe('plan-2');
    expect(executionRegion.querySelector('li:last-child')).toHaveAttribute(
      'data-card-id',
      'plan-1',
    );
  });

  it('reveals stored step input/output only when enabled', () => {
    const { rerender } = render(<AISectionReasoning {...createProps()} />);
    expect(screen.queryByText('list_files input')).toBeNull();

    rerender(<AISectionReasoning {...createProps({ showStepIO: true })} />);
    expect(screen.getByText('Input / output')).toBeDefined();
    expect(screen.getByText('list_files input')).toBeDefined();
    expect(screen.getByText('list_files output')).toBeDefined();
  });

  it('moves the live focus as the activity state changes', () => {
    const { rerender } = render(<AISectionReasoning {...createProps()} />);
    expect(screen.getAllByText('Read source').length).toBeGreaterThan(0);

    const nextActivity: AgentActivityState = {
      ...activity,
      currentPhase: 'work',
      currentNodeId: 'plan-1',
      nodes: activity.nodes.map((item) =>
        item.id === 'plan-0'
          ? { ...item, status: 'completed' as const, detail: 'Source loaded.' }
          : item.id === 'plan-1'
            ? { ...item, status: 'active' as const, detail: 'Generating the requested changes.' }
            : item,
      ),
    };
    rerender(<AISectionReasoning {...createProps({ activity: nextActivity })} />);

    expect(screen.getAllByText('Generate changes').length).toBeGreaterThan(0);
    expect(screen.getByText('Source loaded.')).toBeDefined();

    const executionRegion = screen.getByRole('region', { name: 'Execution timeline' });
    const nodes = [...executionRegion.querySelectorAll('li')];
    expect(nodes[0]).toHaveTextContent('Request');
    expect(nodes[1]).toHaveTextContent('Route');
    expect(nodes.find((node) => node.getAttribute('aria-current') === 'step')).toHaveTextContent(
      'Generate changes',
    );
    expect(nodes.find((node) => node.getAttribute('aria-current') === 'step')).not.toHaveAttribute(
      'data-rotation',
    );
    expect(nodes.find((node) => node.getAttribute('aria-current') === 'step')?.className).toContain(
      'executionNodeactive',
    );
    expect(
      nodes.find((node) => node.getAttribute('aria-current') === 'step'),
    ).not.toHaveTextContent('Read source');
    expect(
      executionRegion.querySelector('[data-card-selected="true"]')?.getAttribute('data-card-id'),
    ).toBe('plan-1');
    expect(
      executionRegion
        .querySelector('[data-card-id="plan-1"]')
        ?.className.includes('executionNodeWorking'),
    ).toBe(true);
  });

  it('renders completed and blocked map outcomes', () => {
    const completed = finishAgentActivity(activity, 'success', 'Everything is ready.', 2_000);
    const { rerender } = render(<AISectionReasoning {...createProps({ activity: completed })} />);
    expect(getLiveExecutionInfo(completed).outcome).toBe('Route complete');
    expect(screen.getByText('Everything is ready.')).toBeDefined();
    const liveExecution = screen.getByRole('region', { name: 'Live execution' });
    expect(within(liveExecution).getAllByText('Route complete')).toHaveLength(1);
    expect(within(liveExecution).getByText('Complete')).toBeDefined();

    const failed = finishAgentActivity(activity, 'error', 'Validation failed.', 2_000);
    rerender(<AISectionReasoning {...createProps({ activity: failed })} />);
    expect(getLiveExecutionInfo(failed).outcome).toBe('Route stopped');
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
  });

  it('keeps the existing text log available as the alternate view', () => {
    render(<AISectionReasoning {...createProps({ viewType: 'text' })} />);

    expect(screen.getByText('Step 1')).toBeDefined();
    expect(screen.getByRole('region', { name: 'Session transcript' })).toBeDefined();
    expect(screen.getByText('Build the app')).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Run overview' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Live execution' })).toBeNull();
  });

  it('renders errors at the end of the visual timeline', () => {
    render(
      <AISectionReasoning
        {...createProps({
          latestError: 'The model stopped responding.',
          activeSession: makeAgentSession({ status: 'error' }),
        })}
      />,
    );

    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Latest error');
    expect(error).toHaveTextContent('The model stopped responding.');
    expect(error.parentElement?.lastElementChild).toBe(error);
  });
});
