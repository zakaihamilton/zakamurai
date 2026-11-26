import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createIdleAgentActivity,
  createRunningAgentActivity,
  node,
} from '@/components/AI/Agent/AgentActivityNodes';
import { makeAgentSession } from '@/test-utils/agentSessionMocks';
import type { AgentActivityState } from '@/types/domain-types';
import type { ModelProgress } from './AISectionReasoningUtils';
import RunOverview from './RunOverview';

const renderOverview = (overrides: Partial<React.ComponentProps<typeof RunOverview>> = {}) => {
  const props: React.ComponentProps<typeof RunOverview> = {
    activeSession: null,
    activity: createIdleAgentActivity(),
    latestError: '',
    hasContent: false,
    ...overrides,
  };
  return render(<RunOverview {...props} />);
};

describe('RunOverview', () => {
  it('renders the empty waiting state without a roadmap or request line', () => {
    renderOverview();

    const overview = screen.getByRole('region', { name: 'Run overview' });
    expect(overview).toHaveAttribute('data-empty', 'true');
    expect(within(overview).getByText('Waiting')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Run stages' })).toBeNull();
    expect(within(overview).queryByText('Request')).toBeNull();

    const live = screen.getByRole('region', { name: 'Live execution' });
    expect(within(live).getByText('Ready when you are')).toBeInTheDocument();
    expect(within(live).getByText('Start with a task')).toBeInTheDocument();
    expect(
      within(live).getByText(
        'Message the AI Manager and your progress will appear here as it runs.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Run status: Waiting.');
  });

  it('renders non-empty waiting state with request text and roadmap', () => {
    renderOverview({
      activity: createIdleAgentActivity('Refactor header'),
    });

    const overview = screen.getByRole('region', { name: 'Run overview' });
    expect(overview).not.toHaveAttribute('data-empty');
    expect(within(overview).getByText('Refactor header')).toBeInTheDocument();

    const roadmap = within(overview).getByRole('list', { name: 'Run stages' });
    expect(roadmap).toHaveAttribute('data-progress-stage', '-1');

    const live = screen.getByRole('region', { name: 'Live execution' });
    expect(within(live).getByText('Waiting to start')).toBeInTheDocument();
    expect(within(live).getByText('Waiting for a run')).toBeInTheDocument();
    expect(within(live).getByText('Start a task to see live progress here.')).toBeInTheDocument();
  });

  it('renders model preparation with determinate, clamped, and indeterminate progress', () => {
    const determinateProgress: ModelProgress = {
      modelName: 'Qwen-Coder',
      progress: 0.456,
      detail: 'Downloading weights…',
    };
    const { rerender } = renderOverview({ modelProgress: determinateProgress });

    expect(screen.getByText('Preparing model')).toBeInTheDocument();
    expect(screen.getByText('Preparing local model')).toBeInTheDocument();
    expect(screen.getByText('Qwen-Coder')).toBeInTheDocument();
    expect(screen.getByText('Downloading weights…')).toBeInTheDocument();
    expect(screen.getByText('46% downloaded')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Loading Qwen-Coder' })).toHaveAttribute(
      'value',
      '0.46',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Preparing local model: Qwen-Coder.');

    rerender(
      <RunOverview
        activeSession={null}
        activity={createIdleAgentActivity()}
        latestError=""
        hasContent={false}
        modelProgress={{ modelName: 'Qwen-Coder', progress: 1.8, detail: 'Finalizing…' }}
      />,
    );
    expect(screen.getByText('100% downloaded')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Loading Qwen-Coder' })).toHaveAttribute(
      'value',
      '1',
    );

    rerender(
      <RunOverview
        activeSession={null}
        activity={createIdleAgentActivity()}
        latestError=""
        hasContent={false}
        modelProgress={{ modelName: 'Qwen-Coder', progress: null, detail: 'Initializing…' }}
      />,
    );
    expect(screen.queryByText(/% downloaded/)).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'Loading Qwen-Coder' })).not.toHaveAttribute(
      'value',
    );
  });

  it('renders running state with empty nodes fallback, phase fallbacks, and next stage', () => {
    const emptyRunning: AgentActivityState = {
      ...createIdleAgentActivity('Build app'),
      outcome: 'running',
      currentPhase: 'context',
      nodes: [],
    };
    const { rerender } = renderOverview({ activity: emptyRunning });

    const roadmap = screen.getByRole('list', { name: 'Run stages' });
    const stages = within(roadmap).getAllByRole('listitem');
    expect(stages[0]).toHaveAttribute('data-stage-status', 'active');
    expect(stages[0]).toHaveAttribute('aria-current', 'step');
    expect(roadmap).toHaveAttribute('data-progress-stage', '1');

    expect(screen.getByText('Working')).toBeInTheDocument();
    expect(screen.getByText('Working now')).toBeInTheDocument();
    expect(screen.getAllByText('Gathering workspace context')).toHaveLength(2);
    const liveExecution = screen.getByRole('region', { name: 'Live execution' });
    expect(within(liveExecution).getByText('Up next')).toBeInTheDocument();
    expect(within(liveExecution).getByText('Work')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Working on Gathering workspace context. Up next: Work.',
    );

    // Null currentPhase and no upcoming stage omits Up next block
    rerender(
      <RunOverview
        activeSession={makeAgentSession({ status: 'running' })}
        activity={{
          ...createIdleAgentActivity('Done soon'),
          outcome: 'running',
          currentPhase: 'result',
          nodes: [
            node({
              id: 'result',
              phase: 'result',
              kind: 'result',
              label: 'Result',
              status: 'active',
            }),
          ],
        }}
        latestError=""
        hasContent={false}
      />,
    );
    expect(screen.queryByText('Up next')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Working on Result.');

    // Null currentPhase with no nodes falls back to generic task text
    rerender(
      <RunOverview
        activeSession={makeAgentSession({ status: 'running' })}
        activity={{
          ...createIdleAgentActivity(),
          outcome: 'running',
          currentPhase: null,
          nodes: [],
        }}
        latestError=""
        hasContent={false}
      />,
    );
    expect(screen.getByText('Preparing the task')).toBeInTheDocument();
    expect(screen.getByText('Starting the run.')).toBeInTheDocument();
  });

  it('highlights streaming character counts and prepares result label for queued result node', () => {
    const runningActivity: AgentActivityState = {
      ...createRunningAgentActivity('Edit component'),
      currentPhase: 'work',
      currentNodeId: null,
      nodes: [
        node({
          id: 'request',
          phase: 'request',
          kind: 'request',
          label: 'Request',
          status: 'completed',
        }),
        node({
          id: 'context',
          phase: 'context',
          kind: 'milestone',
          label: 'Context',
          status: 'completed',
        }),
        node({
          id: 'gen',
          phase: 'work',
          kind: 'model',
          label: 'Generate changes',
          status: 'active',
          detail:
            'Local model is responding — streaming its next action (2,718 character(s) received).',
        }),
        node({
          id: 'result',
          phase: 'result',
          kind: 'result',
          label: 'Ready',
          status: 'queued',
        }),
      ],
    };

    const { rerender } = renderOverview({ activity: runningActivity });
    const countSpan = screen.getByText('2,718');
    expect(countSpan.tagName).toBe('SPAN');
    expect(countSpan.className).toContain('streamingCharacterCount');
    expect(screen.getByText('Prepare the result')).toBeInTheDocument();

    // Non-result nextNode uses its own label
    rerender(
      <RunOverview
        activeSession={null}
        activity={{
          ...runningActivity,
          nodes: [
            ...runningActivity.nodes.slice(0, 3),
            node({
              id: 'val',
              phase: 'validation',
              kind: 'validation',
              label: 'Validate changes',
              status: 'queued',
            }),
          ],
        }}
        latestError=""
        hasContent={false}
      />,
    );
    expect(screen.getByText('Validate changes')).toBeInTheDocument();
  });

  it('renders ready, stopped, and all error stage fallback branches', () => {
    const readyWithoutResult: AgentActivityState = {
      ...createIdleAgentActivity('Answer'),
      outcome: 'success',
      nodes: [
        node({
          id: 'request',
          phase: 'request',
          kind: 'request',
          label: 'Request',
          status: 'completed',
        }),
      ],
    };
    const { rerender } = renderOverview({ activity: readyWithoutResult });

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Final result')).toBeInTheDocument();
    expect(screen.getByText('Run complete')).toBeInTheDocument();
    expect(screen.getByText('The run is complete.')).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Run stages' }).querySelector('li svg'),
    ).toBeInTheDocument();

    // Ready with explicit result node detail
    rerender(
      <RunOverview
        activeSession={null}
        activity={{
          ...readyWithoutResult,
          nodes: [
            ...readyWithoutResult.nodes,
            node({
              id: 'result',
              phase: 'result',
              kind: 'result',
              label: 'Ready',
              status: 'completed',
              detail: 'Updated 2 files.',
            }),
          ],
        }}
        latestError=""
        hasContent={false}
      />,
    );
    expect(screen.getByText('Updated 2 files.')).toBeInTheDocument();

    // Stopped (aborted)
    rerender(
      <RunOverview
        activeSession={null}
        activity={{ ...createIdleAgentActivity('Stop'), outcome: 'aborted' }}
        latestError=""
        hasContent={false}
      />,
    );
    expect(screen.getByText('Stopped')).toBeInTheDocument();
    expect(screen.getAllByText('Run stopped')).toHaveLength(2);
    expect(screen.getByText('The run was stopped before it finished.')).toBeInTheDocument();

    // Error with failedNode (non-result) and no latestError
    const errorWithFailedNode: AgentActivityState = {
      ...createIdleAgentActivity('Fail'),
      outcome: 'error',
      nodes: [
        node({
          id: 'plan-0',
          phase: 'work',
          kind: 'tool',
          label: 'Write files',
          status: 'failed',
          detail: 'Permission denied',
        }),
      ],
    };
    rerender(
      <RunOverview
        activeSession={null}
        activity={errorWithFailedNode}
        latestError=""
        hasContent={false}
      />,
    );
    const errorRoadmap = screen.getByRole('list', { name: 'Run stages' });
    expect(errorRoadmap).toHaveAttribute('data-progress-error', 'true');
    expect(within(errorRoadmap).getAllByRole('listitem')[2]).toHaveAttribute(
      'data-stage-status',
      'failed',
    );
    expect(screen.getByText('Write files')).toBeInTheDocument();
    expect(screen.getByText('Permission denied')).toBeInTheDocument();

    // Error with active stage (via session error while activity nodes still active) and latestError override
    const activeStageError: AgentActivityState = {
      ...createIdleAgentActivity('Active fail'),
      outcome: 'running',
      currentPhase: 'context',
      nodes: [
        node({
          id: 'context',
          phase: 'context',
          kind: 'milestone',
          label: 'Gather context',
          status: 'active',
        }),
      ],
    };
    rerender(
      <RunOverview
        activeSession={makeAgentSession({ status: 'error' })}
        activity={activeStageError}
        latestError="Model disconnected"
        hasContent={false}
      />,
    );
    expect(
      within(screen.getByRole('list', { name: 'Run stages' })).getAllByRole('listitem')[1],
    ).toHaveAttribute('data-stage-status', 'failed');
    expect(screen.getByText('Model disconnected')).toBeInTheDocument();

    // Error with neither failed nor active stage falls back to last stage ('result') and default error detail
    rerender(
      <RunOverview
        activeSession={makeAgentSession({ status: 'error' })}
        activity={createIdleAgentActivity('Generic fail')}
        latestError=""
        hasContent={false}
      />,
    );
    expect(
      within(screen.getByRole('list', { name: 'Run stages' })).getAllByRole('listitem')[4],
    ).toHaveAttribute('data-stage-status', 'failed');
    expect(screen.getByText('The run stopped with an error.')).toBeInTheDocument();
  });
});
