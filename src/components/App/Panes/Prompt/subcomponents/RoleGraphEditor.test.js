import { createDefaultRoleGraph } from '@/components/AI/Agent/Roles';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RoleGraphEditor from './RoleGraphEditor';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Plus: () => <span>plus</span>,
    Refresh: () => <span>refresh</span>,
    Trash: () => <span>trash</span>,
  },
}));

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
    expect(onChange.mock.calls.at(-1)[0].roles[1].kind).toBe('planner');

    fireEvent.change(screen.getByLabelText('Role 1 label'), { target: { value: 'Lead' } });
    expect(onChange.mock.calls.at(-1)[0].roles[0].label).toBe('Lead');

    fireEvent.click(screen.getByText('+ Custom'));
    expect(onChange.mock.calls.at(-1)[0].roles.some((role) => role.kind === 'custom')).toBe(true);

    fireEvent.click(screen.getByLabelText('Reset role graph'));
    expect(onChange.mock.calls.at(-1)[0].roles).toHaveLength(3);
    expect(onChange.mock.calls.at(-1)[0].roles.map((role) => role.kind)).toEqual([
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

    const coderCard = container.querySelector('[data-role-id="coder"]');
    const coderSelects = coderCard.querySelectorAll('select');
    fireEvent.change(coderSelects[1], { target: { value: 'model-b' } });
    expect(onChange.mock.calls.at(-1)[0].roles[1].modelId).toBe('model-b');

    const reviewerCard = container.querySelector('[data-role-id="reviewer"]');
    const reviewerSelects = reviewerCard.querySelectorAll('select');
    fireEvent.change(reviewerSelects[2], { target: { value: 'planner' } });
    expect(
      onChange.mock.calls
        .at(-1)[0]
        .edges.some((edge) => edge.when === 'reject' && edge.to === 'planner'),
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
    expect(onChange.mock.calls.at(-1)[0].roles).toHaveLength(2);
  });

  it('edits custom prompts, kinds, and reject retry limits', () => {
    const onChange = vi.fn();
    const graph = createDefaultRoleGraph();
    graph.roles[0] = { ...graph.roles[0], kind: 'custom', label: 'Custom', systemPrompt: null };
    const { container } = render(
      <RoleGraphEditor roleGraph={graph} modelOptions={modelOptions} onChange={onChange} />,
    );

    const textarea = screen.getByPlaceholderText(/Optional custom instructions/);
    fireEvent.change(textarea, { target: { value: 'Be careful.' } });
    expect(onChange.mock.calls.at(-1)[0].roles[0].systemPrompt).toBe('Be careful.');

    const customCard = container.querySelector('[data-role-id="planner"]');
    fireEvent.change(customCard.querySelectorAll('select')[0], { target: { value: 'coder' } });
    expect(onChange.mock.calls.at(-1)[0].roles[0].kind).toBe('coder');

    const reviewerCard = container.querySelector('[data-role-id="reviewer"]');
    const retryInput = reviewerCard.querySelector('input[type="number"]');
    fireEvent.change(retryInput, { target: { value: '2' } });
    expect(
      onChange.mock.calls.at(-1)[0].edges.find((edge) => edge.when === 'reject')?.maxTimes,
    ).toBe(2);
  });
});
