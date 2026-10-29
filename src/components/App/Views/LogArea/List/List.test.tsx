import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LogList from './List';

describe('LogList', () => {
  it('renders visible logs', () => {
    render(
      <LogList
        visibleLogs={[
          {
            log: { id: 1, role: 'ai', text: 'Hello human', timestamp: '12:00:00' },
            displayIndex: 0,
          },
          {
            log: { id: 2, role: 'user', text: 'Hello bot', timestamp: '12:00:01' },
            displayIndex: 1,
          },
        ]}
        totalLogsCount={2}
        filterText=""
        isProcessing={false}
        isAIProcessing={false}
        isSystemProcessing={false}
      />,
    );

    expect(screen.getByText('Hello human')).toBeDefined();
    expect(screen.getByText('Hello bot')).toBeDefined();
  });

  it('explains an empty log and hides that message while work is running', () => {
    const props = {
      visibleLogs: [],
      totalLogsCount: 0,
      filterText: '',
      isProcessing: false,
      isAIProcessing: false,
      isSystemProcessing: false,
    };
    const { rerender } = render(<LogList {...props} />);
    expect(screen.getByText('No logs yet. Build your project to see output here.')).toBeDefined();
    rerender(<LogList {...props} isProcessing isSystemProcessing />);
    expect(screen.queryByText('No logs yet. Build your project to see output here.')).toBeNull();
  });

  it('renders processing messages for AI, system, or both', () => {
    const { rerender } = render(
      <LogList
        visibleLogs={[]}
        totalLogsCount={0}
        filterText=""
        isProcessing={true}
        isAIProcessing={true}
        isSystemProcessing={false}
      />,
    );
    expect(screen.getByText('AI is working...')).toBeDefined();

    rerender(
      <LogList
        visibleLogs={[]}
        totalLogsCount={0}
        filterText=""
        isProcessing={true}
        isAIProcessing={true}
        isSystemProcessing={true}
      />,
    );
    expect(screen.getByText('AI & System working...')).toBeDefined();

    rerender(
      <LogList
        visibleLogs={[]}
        totalLogsCount={0}
        filterText=""
        isProcessing={true}
        isAIProcessing={false}
        isSystemProcessing={true}
      />,
    );
    expect(screen.getByText('System is working...')).toBeDefined();
  });

  it('shows an empty state when logs exist but none are visible', () => {
    render(
      <LogList
        visibleLogs={[]}
        totalLogsCount={2}
        filterText="missing"
        isProcessing={false}
        isAIProcessing={false}
        isSystemProcessing={false}
      />,
    );

    expect(screen.getByText('No logs match "missing"')).toBeDefined();
  });

  it('styles error logs', () => {
    const { container } = render(
      <LogList
        visibleLogs={[
          {
            log: {
              id: 1,
              role: 'system',
              text: 'ERR: Something went wrong',
              timestamp: '2024-01-01T00:00:00Z',
            },
            displayIndex: 0,
          },
        ]}
        totalLogsCount={1}
        filterText=""
        isProcessing={false}
        isAIProcessing={false}
        isSystemProcessing={false}
      />,
    );

    expect(container.querySelector('[class*="errorRow"]')).toBeDefined();
  });
});
