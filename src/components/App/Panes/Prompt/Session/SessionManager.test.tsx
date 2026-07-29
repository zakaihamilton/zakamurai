import { makeAgentSession } from '@/test-utils/agentSessionMocks';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import SessionManager from './SessionManager';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    History: () => <span>history</span>,
  },
}));

describe('SessionManager', () => {
  it('shows the active agent and opens the tree browser', () => {
    const onOpenTree = vi.fn();
    render(
      <SessionManager
        activeSession={makeAgentSession({ id: 'b', name: 'Agent B', status: 'running' })}
        onOpenTree={onOpenTree}
      />,
    );

    expect(screen.getByLabelText('Active agent')).toHaveTextContent('Agent B');
    expect(screen.getByLabelText('Running')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Open agent tree'));
    expect(onOpenTree).toHaveBeenCalledOnce();
  });
});
