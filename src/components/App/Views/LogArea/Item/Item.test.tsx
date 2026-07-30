import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LogItem from './Item';

describe('LogItem', () => {
  it('renders log entry content, timestamp, and line number', () => {
    const log = {
      id: 1,
      role: 'ai',
      text: 'Compilation successful',
      timestamp: '14:30:00',
    };

    render(<LogItem log={log} displayIndex={0} />);

    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('14:30:00')).toBeDefined();
    expect(screen.getByText('Compilation successful')).toBeDefined();
  });

  it('renders user prompt symbol $ for user role', () => {
    const log = {
      id: 2,
      role: 'user',
      text: 'Build the project',
      timestamp: '14:31:00',
    };

    render(<LogItem log={log} displayIndex={1} />);

    expect(screen.getByText('$')).toBeDefined();
  });

  it('does not style npm progress for error-named packages as an error', () => {
    const { container } = render(
      <LogItem
        log={{
          id: 3,
          role: 'system',
          text: '[NPM] Downloading error-stack-parser@2.1.4...',
          timestamp: '14:32:00',
        }}
        displayIndex={2}
      />,
    );

    expect(container.querySelector('[class*="errorRow"]')).toBeNull();
  });
});
