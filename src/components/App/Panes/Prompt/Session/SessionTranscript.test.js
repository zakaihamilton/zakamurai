import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SessionTranscript from './SessionTranscript';

describe('SessionTranscript', () => {
  it('renders empty state', () => {
    render(<SessionTranscript messages={[]} />);
    expect(screen.getByText(/Start a conversation/)).toBeDefined();
  });

  it('renders user, ai, and system messages with role labels', () => {
    render(
      <SessionTranscript
        messages={[
          { id: 1, role: 'user', text: 'hello', timestamp: '10:00:00' },
          { id: 2, role: 'ai', text: 'hi', agentRole: 'planner', timestamp: '10:00:01' },
          { id: 3, role: 'system', text: 'stopped' },
          { id: 4, role: 'ai', text: 'done' },
        ]}
      />,
    );
    expect(screen.getByText('hello')).toBeDefined();
    expect(screen.getByText('AI · planner')).toBeDefined();
    expect(screen.getByText('System')).toBeDefined();
    expect(screen.getByText('AI')).toBeDefined();
  });
});
