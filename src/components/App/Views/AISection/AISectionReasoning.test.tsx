import { createAgentRunUsage } from '@/components/App/Panes/Prompt/AgentSessions';
import { makeAgentSession } from '@/test-utils/agentSessionMocks';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AISectionReasoning from './AISectionReasoning';
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
  it('renders the visual overview and chronological timeline', () => {
    render(<AISectionReasoning {...createProps()} />);

    expect(screen.getByRole('region', { name: 'Run overview' })).toBeDefined();
    expect(screen.getByText('Working')).toBeDefined();
    expect(screen.getByText('Model calls')).toBeDefined();
    expect(screen.getByText('Agent timeline')).toBeDefined();
    expect(screen.getByText('Routing')).toBeDefined();
    expect(screen.getByText('deciding what to do')).toBeDefined();
    expect(screen.getByText('Progress')).toBeDefined();
    expect(screen.getAllByText('Step 1')).toHaveLength(1);
    expect(screen.getByText('Reading the workspace')).toBeDefined();
    expect(screen.getByText('Build the app')).toBeDefined();
  });

  it('reveals stored step input/output only when enabled', () => {
    const { rerender } = render(<AISectionReasoning {...createProps()} />);
    expect(screen.queryByText('list_files input')).toBeNull();

    rerender(<AISectionReasoning {...createProps({ showStepIO: true })} />);
    expect(screen.getByText('Input / output')).toBeDefined();
    expect(screen.getByText('list_files input')).toBeDefined();
    expect(screen.getByText('list_files output')).toBeDefined();
  });

  it('keeps the existing text log available as the alternate view', () => {
    render(<AISectionReasoning {...createProps({ viewType: 'text' })} />);

    expect(screen.getByText('Step 1')).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Run overview' })).toBeNull();
    expect(screen.queryByText('Agent timeline')).toBeNull();
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
