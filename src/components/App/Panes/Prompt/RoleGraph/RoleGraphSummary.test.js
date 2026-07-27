import { createDefaultRoleGraph } from '@/components/AI/Agent/Roles';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RoleGraphSummary from './RoleGraphSummary';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Edit: () => <span>edit</span>,
  },
}));

describe('RoleGraphSummary', () => {
  it('renders the graph description and opens the editor', () => {
    const onEdit = vi.fn();
    render(<RoleGraphSummary roleGraph={createDefaultRoleGraph()} onEdit={onEdit} />);
    expect(screen.getByLabelText('Team role graph summary')).toBeDefined();
    expect(screen.getByText('Planner → Coder → Reviewer')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Edit role graph'));
    expect(onEdit).toHaveBeenCalled();
  });
});
