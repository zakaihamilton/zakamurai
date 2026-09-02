import type { ManagerTrace } from '@/components/AI/Agent';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ManagerTraceInspector from './ManagerTraceInspector';

const trace: ManagerTrace = {
  version: 1,
  runId: 'test-run',
  request: 'list files',
  startedAt: 100,
  endedAt: 125,
  durationMs: 61_000,
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
      elapsedMs: 5_000,
      phase: 'tool',
      turn: 1,
      tool: 'list_files',
      status: 'started',
      input: '{}',
      provenance: 'model',
    },
  ],
};

describe('ManagerTraceInspector', () => {
  it('renders the development trace timeline', () => {
    render(<ManagerTraceInspector trace={trace} />);

    expect(screen.getByTestId('manager-trace-inspector')).toBeDefined();
    expect(screen.queryByRole('dialog', { name: 'Manager debug trace' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Open manager debug trace/ }));
    expect(screen.getByRole('dialog', { name: 'Manager debug trace' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Export JSON' }).textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Copy trace' }).textContent).toBe('');
    expect(screen.getByText(/success · 2 events · 1m 01s/)).toBeDefined();
    expect(screen.getByText(/#2 tool · 0m 05s/)).toBeDefined();
    expect(screen.getByText(/source: model/)).toBeDefined();
    expect(screen.getByText('input: {}')).toBeDefined();
  });

  it('exports the current trace as JSON', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ManagerTraceInspector trace={trace} />);
    fireEvent.click(screen.getByRole('button', { name: /Open manager debug trace/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));

    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });

  it('copies a trace and a replay fixture and can reload the request', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const onReplayRequest = vi.fn();

    render(
      <ManagerTraceInspector
        trace={trace}
        files={{ 'src/App.jsx': 'old' }}
        onReplayRequest={onReplayRequest}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Open manager debug trace/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy trace' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy replay fixture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replay request' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText.mock.calls[1][0]).toContain('trace-test-run');
    expect(onReplayRequest).toHaveBeenCalledWith('list files');
  });
});
