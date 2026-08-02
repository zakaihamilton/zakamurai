import type { ManagerTrace } from '@/components/AI/Agent';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ManagerTraceInspector from './ManagerTraceInspector';

const trace: ManagerTrace = {
  version: 1,
  runId: 'test-run',
  request: 'list files',
  startedAt: 100,
  endedAt: 125,
  durationMs: 25,
  outcome: 'success',
  events: [
    {
      sequence: 1,
      elapsedMs: 2,
      phase: 'routing',
      turn: 0,
      message: 'Request routed to workspace-query.',
    },
    {
      sequence: 2,
      elapsedMs: 5,
      phase: 'tool',
      turn: 1,
      tool: 'list_files',
      status: 'started',
      input: '{}',
    },
  ],
};

describe('ManagerTraceInspector', () => {
  it('renders the development trace timeline', () => {
    render(<ManagerTraceInspector trace={trace} />);

    expect(screen.getByTestId('manager-trace-inspector')).toBeDefined();
    expect(screen.getByText(/success · 2 events · 25 ms/)).toBeDefined();
    expect(screen.getByText(/#2 tool · 5 ms/)).toBeDefined();
    expect(screen.getByText('input: {}')).toBeDefined();
  });

  it('exports the current trace as JSON', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ManagerTraceInspector trace={trace} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));

    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });
});
