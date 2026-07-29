import {
  ROLE_KINDS,
  ROLE_KIND_DEFAULTS,
  createDefaultRoleGraph,
  createRoleNode,
  findEdge,
  normalizeRoleGraph,
  syncLinearAlwaysEdges,
} from '@/components/AI/Agent/Roles';
import type { RoleEdge, RoleGraph, RoleKind, RoleNode } from '@/components/AI/types';
import type { RoleGraphEditorProps } from '@/components/App/Panes/Prompt/prompt-types';
import type { SelectOption } from '@/components/ui/types';
import React from 'react';
import RoleCard from './RoleCard';
import RoleGraphAddRow from './RoleGraphAddRow';
import styles from './RoleGraphEditor.module.css';
import RoleGraphHeader from './RoleGraphHeader';

const KIND_OPTIONS: SelectOption[] = ROLE_KINDS.map((kind) => ({
  value: kind,
  label: ROLE_KIND_DEFAULTS[kind].label,
}));

export default function RoleGraphEditor({
  roleGraph,
  modelOptions = [],
  defaultModelId = '',
  disabled = false,
  onChange,
  showTitle = true,
}: RoleGraphEditorProps) {
  const graph = normalizeRoleGraph(roleGraph || createDefaultRoleGraph());

  const commit = (nextRoles: RoleNode[], nextEdges: RoleEdge[] = graph.edges) => {
    onChange?.(
      syncLinearAlwaysEdges({
        ...graph,
        roles: nextRoles,
        edges: nextEdges,
      }),
    );
  };

  const updateRole = (roleId: string, patch: Partial<RoleNode>) => {
    const roles = graph.roles.map((role) => (role.id === roleId ? { ...role, ...patch } : role));
    commit(roles);
  };

  const moveRole = (index: number, delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= graph.roles.length) return;
    const roles = [...graph.roles];
    const [item] = roles.splice(index, 1);
    roles.splice(next, 0, item);
    commit(roles);
  };

  const removeRole = (roleId: string) => {
    if (graph.roles.length <= 1) return;
    commit(graph.roles.filter((role) => role.id !== roleId));
  };

  const addRole = (kind: RoleKind | string = 'custom') => {
    const role = createRoleNode({ kind });
    const roles = [...graph.roles, role];
    let edges = graph.edges;
    if (kind === 'reviewer') {
      const coderLike =
        roles.find((r) => r.kind === 'coder') || roles[Math.max(0, roles.length - 2)];
      if (coderLike) {
        edges = [
          ...edges.filter((edge) => !(edge.from === role.id && edge.when === 'reject')),
          { from: role.id, to: coderLike.id, when: 'reject' as const, maxTimes: 1 },
        ];
      }
    }
    commit(roles, edges);
  };

  const setRejectTarget = (fromId: string, toId: string | null, maxTimes = 1) => {
    const edges: RoleEdge[] = [
      ...graph.edges.filter((edge) => !(edge.from === fromId && edge.when === 'reject')),
      ...(toId ? [{ from: fromId, to: toId, when: 'reject' as const, maxTimes }] : []),
    ];
    commit(graph.roles, edges);
  };

  return (
    <div className={styles.editor} aria-label="Role graph editor">
      <RoleGraphHeader
        showTitle={showTitle}
        disabled={disabled}
        onReset={() => onChange?.(createDefaultRoleGraph())}
        onAddCustom={() => addRole('custom')}
      />

      <div className={styles.list}>
        {graph.roles.map((role, index) => {
          const rejectEdge = findEdge(graph, role.id, 'reject');
          return (
            <RoleCard
              key={role.id}
              role={role}
              index={index}
              roleCount={graph.roles.length}
              kindOptions={KIND_OPTIONS}
              modelOptions={modelOptions}
              defaultModelId={defaultModelId}
              rejectEdge={rejectEdge}
              otherRoles={graph.roles.filter((candidate) => candidate.id !== role.id)}
              disabled={disabled}
              onUpdateLabel={(label) => updateRole(role.id, { label })}
              onMoveUp={() => moveRole(index, -1)}
              onMoveDown={() => moveRole(index, 1)}
              onRemove={() => removeRole(role.id)}
              onChangeKind={(kind, label) =>
                updateRole(role.id, {
                  kind: kind as RoleKind,
                  label,
                  systemPrompt: null,
                  allowedActions: null,
                  maxTurns: null,
                })
              }
              onChangeModel={(modelId) => updateRole(role.id, { modelId })}
              onChangeJoin={(join) => updateRole(role.id, { join: join as 'all' | 'any' })}
              onChangeMaxRetries={(maxRetries) => updateRole(role.id, { maxRetries })}
              onChangeSystemPrompt={(systemPrompt) => updateRole(role.id, { systemPrompt })}
              onChangeRejectTarget={(toId, maxTimes) => setRejectTarget(role.id, toId, maxTimes)}
              onChangeRejectMaxTimes={(maxTimes) =>
                setRejectTarget(role.id, rejectEdge?.to ?? null, maxTimes)
              }
            />
          );
        })}
      </div>

      <RoleGraphAddRow kindOptions={KIND_OPTIONS} disabled={disabled} onAdd={addRole} />
    </div>
  );
}
