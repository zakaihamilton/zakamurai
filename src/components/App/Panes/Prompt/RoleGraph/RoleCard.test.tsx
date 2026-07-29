import { createDefaultRoleGraph } from '@/components/AI/Agent/Roles';
import { requireElement } from '@/test-utils/domMocks';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RoleCard from './RoleCard';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Trash: () => <span>trash</span>,
  },
}));

describe('RoleCard', () => {
  const graph = createDefaultRoleGraph();
  const role = graph.roles[0];
  const kindOptions = [
    { value: 'planner', label: 'Planner' },
    { value: 'coder', label: 'Coder' },
    { value: 'custom', label: 'Custom' },
  ];
  const modelOptions = [
    { value: 'model-a', label: 'Model A' },
    { value: 'model-b', label: 'Model B' },
  ];

  it('updates the role label and move/remove actions', () => {
    const onUpdateLabel = vi.fn();
    const onMoveDown = vi.fn();
    const onRemove = vi.fn();

    render(
      <RoleCard
        role={role}
        index={0}
        roleCount={3}
        kindOptions={kindOptions}
        modelOptions={modelOptions}
        onUpdateLabel={onUpdateLabel}
        onMoveDown={onMoveDown}
        onRemove={onRemove}
      />,
    );

    fireEvent.change(screen.getByLabelText('Role 1 label'), { target: { value: 'Lead' } });
    expect(onUpdateLabel).toHaveBeenCalledWith('Lead');

    fireEvent.click(screen.getByLabelText('Move Planner down'));
    expect(onMoveDown).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Remove Planner'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('changes model and reject target selections', () => {
    const onChangeModel = vi.fn();
    const onChangeRejectTarget = vi.fn();
    const reviewer = graph.roles[2];
    const rejectEdge = graph.edges.find((edge) => edge.when === 'reject');

    const { container } = render(
      <RoleCard
        role={reviewer}
        index={2}
        roleCount={3}
        kindOptions={kindOptions}
        modelOptions={modelOptions}
        rejectEdge={rejectEdge}
        otherRoles={graph.roles.filter((candidate) => candidate.id !== reviewer.id)}
        onChangeModel={onChangeModel}
        onChangeRejectTarget={onChangeRejectTarget}
      />,
    );

    const selects = container
      .querySelector('[data-role-id="reviewer"]')
      ?.querySelectorAll('select');
    fireEvent.change(requireElement(selects?.[1] ?? null), { target: { value: 'model-b' } });
    expect(onChangeModel).toHaveBeenCalledWith('model-b');

    fireEvent.change(requireElement(selects?.[2] ?? null), { target: { value: 'planner' } });
    expect(onChangeRejectTarget).toHaveBeenCalledWith('planner', rejectEdge?.maxTimes);
  });
});
