import { createDefaultRoleGraph } from '@/components/AI/Agent/Roles';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RoleGraphDialog from './RoleGraphDialog';
import RoleGraphEditor from './RoleGraphEditor';
import RoleGraphSummary from './RoleGraphSummary';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
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

vi.mock('@/components/ui/Dialog', () => ({
  default: ({ isOpen, title, children, onCancel }) =>
    isOpen ? (
      <dialog open aria-label={title}>
        <h3>{title}</h3>
        <button type="button" onClick={onCancel} aria-label="Close dialog">
          close
        </button>
        {children}
      </dialog>
    ) : null,
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

  it('can hide the title when embedded in a dialog', () => {
    render(
      <RoleGraphEditor roleGraph={createDefaultRoleGraph()} showTitle={false} onChange={vi.fn()} />,
    );
    expect(screen.queryByText('Role graph')).toBeNull();
    expect(screen.getByText(/Order, kinds, and per-role models/)).toBeDefined();
  });
});

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

describe('RoleGraphDialog', () => {
  it('renders the editor only when open', () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <RoleGraphDialog
        isOpen={false}
        onCancel={onCancel}
        roleGraph={createDefaultRoleGraph()}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Role graph editor')).toBeNull();

    rerender(
      <RoleGraphDialog
        isOpen
        onCancel={onCancel}
        roleGraph={createDefaultRoleGraph()}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Team role graph' })).toBeDefined();
    expect(screen.getByLabelText('Role graph editor')).toBeDefined();

    fireEvent.click(screen.getByLabelText('Close dialog'));
    expect(onCancel).toHaveBeenCalled();
  });
});
