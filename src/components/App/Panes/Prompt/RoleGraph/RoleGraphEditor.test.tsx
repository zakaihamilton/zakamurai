import { createDefaultRoleGraph } from '@/components/AI/Agent/Roles';
import type { RoleGraph } from '@/components/AI/types';
import { requireElement } from '@/test-utils/domMocks';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import RoleGraphEditor from './RoleGraphEditor';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Plus: () => <span>plus</span>,
    Refresh: () => <span>refresh</span>,
    Trash: () => <span>trash</span>,
    Edit: () => <span>edit</span>,
    Close: () => <span>close</span>,
  },
}));

function lastGraph(onChange: ReturnType<typeof vi.fn>): RoleGraph {
  const call = onChange.mock.calls.at(-1);
  expect(call).toBeDefined();
  return call?.[0] as RoleGraph;
}

describe('RoleGraphEditor', () => {
  const modelOptions = [
    { value: 'model-a', label: 'Model A' },
    { value: 'model-b', label: 'Model B' },
  ];

  it('edits labels, adds roles, and resets the graph', () => {
    const onChange = vi.fn();
    render(
      <RoleGraphEditor
        roleGraph={createDefaultRoleGraph()}
        modelOptions={modelOptions}
        defaultModelId="model-a"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('Move Planner down'));
    expect(lastGraph(onChange).roles[1]?.kind).toBe('planner');

    fireEvent.change(screen.getByLabelText('Role 1 label'), { target: { value: 'Lead' } });
    expect(lastGraph(onChange).roles[0]?.label).toBe('Lead');

    fireEvent.click(screen.getByText('+ Custom'));
    expect(
      lastGraph(onChange).roles.some((role: RoleGraph['roles'][number]) => role.kind === 'custom'),
    ).toBe(true);

    fireEvent.click(screen.getByLabelText('Reset role graph'));
    expect(lastGraph(onChange).roles).toHaveLength(3);
    expect(lastGraph(onChange).roles.map((role: RoleGraph['roles'][number]) => role.kind)).toEqual([
      'planner',
      'coder',
      'reviewer',
    ]);
  });

  it('sets a per-role model and reject target', () => {
    const onChange = vi.fn();
    const { container } = render(
      <RoleGraphEditor
        roleGraph={createDefaultRoleGraph()}
        modelOptions={modelOptions}
        onChange={onChange}
      />,
    );

    const coderCard = requireElement(container.querySelector('[data-role-id="coder"]'));
    const coderSelects = coderCard.querySelectorAll('select');
    fireEvent.change(requireElement(coderSelects[1]), { target: { value: 'model-b' } });
    expect(lastGraph(onChange).roles[1]?.modelId).toBe('model-b');

    const reviewerCard = requireElement(container.querySelector('[data-role-id="reviewer"]'));
    const reviewerSelects = reviewerCard.querySelectorAll('select');
    fireEvent.change(requireElement(reviewerSelects[2]), { target: { value: 'planner' } });
    expect(
      lastGraph(onChange).edges.some(
        (edge: RoleGraph['edges'][number]) => edge.when === 'reject' && edge.to === 'planner',
      ),
    ).toBe(true);
  });

  it('removes a role when more than one remains', () => {
    const onChange = vi.fn();
    render(
      <RoleGraphEditor
        roleGraph={createDefaultRoleGraph()}
        modelOptions={modelOptions}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Remove Reviewer'));
    expect(lastGraph(onChange).roles).toHaveLength(2);
  });

  it('edits custom prompts, kinds, and reject retry limits', () => {
    const onChange = vi.fn();
    const graph = createDefaultRoleGraph();
    const firstRole = graph.roles[0];
    if (!firstRole) throw new Error('expected first role');
    graph.roles[0] = { ...firstRole, kind: 'custom', label: 'Custom', systemPrompt: null };
    const { container } = render(
      <RoleGraphEditor roleGraph={graph} modelOptions={modelOptions} onChange={onChange} />,
    );

    const textarea = screen.getByPlaceholderText(/Optional custom instructions/);
    fireEvent.change(textarea, { target: { value: 'Be careful.' } });
    expect(lastGraph(onChange).roles[0]?.systemPrompt).toBe('Be careful.');

    const customCard = requireElement(container.querySelector('[data-role-id="planner"]'));
    fireEvent.change(requireElement(customCard.querySelectorAll('select')[0]), {
      target: { value: 'coder' },
    });
    expect(lastGraph(onChange).roles[0]?.kind).toBe('coder');

    const reviewerCard = requireElement(container.querySelector('[data-role-id="reviewer"]'));
    const retryInput = requireElement(reviewerCard.querySelector('input[type="number"]'));
    fireEvent.change(retryInput, { target: { value: '2' } });
    expect(
      lastGraph(onChange).edges.find((edge: RoleGraph['edges'][number]) => edge.when === 'reject')
        ?.maxTimes,
    ).toBe(2);
  });
});
