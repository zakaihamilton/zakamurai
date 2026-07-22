import {
  ROLE_KINDS,
  ROLE_KIND_DEFAULTS,
  createDefaultRoleGraph,
  createRoleNode,
  findEdge,
  normalizeRoleGraph,
  syncLinearAlwaysEdges,
} from '@/components/AI/Agent/Roles';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React from 'react';
import styles from './RoleGraphEditor.module.css';

const KIND_OPTIONS = ROLE_KINDS.map((kind) => ({
  value: kind,
  label: ROLE_KIND_DEFAULTS[kind].label,
}));

export default function RoleGraphEditor({
  roleGraph,
  modelOptions = [],
  defaultModelId = '',
  disabled = false,
  onChange,
}) {
  const graph = normalizeRoleGraph(roleGraph || createDefaultRoleGraph());

  const commit = (nextRoles, nextEdges = graph.edges) => {
    onChange?.(
      syncLinearAlwaysEdges({
        ...graph,
        roles: nextRoles,
        edges: nextEdges,
      }),
    );
  };

  const updateRole = (roleId, patch) => {
    const roles = graph.roles.map((role) => (role.id === roleId ? { ...role, ...patch } : role));
    commit(roles);
  };

  const moveRole = (index, delta) => {
    const next = index + delta;
    if (next < 0 || next >= graph.roles.length) return;
    const roles = [...graph.roles];
    const [item] = roles.splice(index, 1);
    roles.splice(next, 0, item);
    commit(roles);
  };

  const removeRole = (roleId) => {
    if (graph.roles.length <= 1) return;
    commit(graph.roles.filter((role) => role.id !== roleId));
  };

  const addRole = (kind = 'custom') => {
    const role = createRoleNode({ kind });
    const roles = [...graph.roles, role];
    let edges = graph.edges;
    if (kind === 'reviewer') {
      const coderLike =
        roles.find((r) => r.kind === 'coder') || roles[Math.max(0, roles.length - 2)];
      if (coderLike) {
        edges = [
          ...edges.filter((edge) => !(edge.from === role.id && edge.when === 'reject')),
          { from: role.id, to: coderLike.id, when: 'reject', maxTimes: 1 },
        ];
      }
    }
    commit(roles, edges);
  };

  const setRejectTarget = (fromId, toId, maxTimes = 1) => {
    const edges = [
      ...graph.edges.filter((edge) => !(edge.from === fromId && edge.when === 'reject')),
      ...(toId ? [{ from: fromId, to: toId, when: 'reject', maxTimes }] : []),
    ];
    commit(graph.roles, edges);
  };

  return (
    <div className={styles.editor} aria-label="Team role graph">
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Role graph</div>
          <div className={styles.subtitle}>Order, kinds, and per-role models for Team mode</div>
        </div>
        <div className={styles.headerActions}>
          <Tooltip content="Reset to Planner → Coder → Reviewer">
            <button
              type="button"
              className={styles.iconBtn}
              disabled={disabled}
              onClick={() => onChange?.(createDefaultRoleGraph())}
              aria-label="Reset role graph"
            >
              <Icons.Refresh />
            </button>
          </Tooltip>
          <Tooltip content="Add custom role">
            <button
              type="button"
              className={styles.iconBtn}
              disabled={disabled}
              onClick={() => addRole('custom')}
              aria-label="Add role"
            >
              <Icons.Plus />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className={styles.list}>
        {graph.roles.map((role, index) => {
          const rejectEdge = findEdge(graph, role.id, 'reject');
          return (
            <div key={role.id} className={styles.card} data-role-id={role.id}>
              <div className={styles.cardTop}>
                <span className={styles.index}>{index + 1}</span>
                <input
                  className={styles.labelInput}
                  value={role.label}
                  disabled={disabled}
                  aria-label={`Role ${index + 1} label`}
                  onChange={(e) => updateRole(role.id, { label: e.target.value })}
                />
                <div className={styles.moveActions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    disabled={disabled || index === 0}
                    onClick={() => moveRole(index, -1)}
                    aria-label={`Move ${role.label} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    disabled={disabled || index === graph.roles.length - 1}
                    onClick={() => moveRole(index, 1)}
                    aria-label={`Move ${role.label} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    disabled={disabled || graph.roles.length <= 1}
                    onClick={() => removeRole(role.id)}
                    aria-label={`Remove ${role.label}`}
                  >
                    <Icons.Trash />
                  </button>
                </div>
              </div>

              <div className={styles.row}>
                <label className={styles.field}>
                  <span>Kind</span>
                  <select
                    value={role.kind}
                    disabled={disabled}
                    onChange={(e) => {
                      const kind = e.target.value;
                      updateRole(role.id, {
                        kind,
                        label: ROLE_KIND_DEFAULTS[kind]?.label || role.label,
                        systemPrompt: null,
                        allowedActions: null,
                        maxTurns: null,
                      });
                    }}
                  >
                    {KIND_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.field}>
                  <span>Model</span>
                  <select
                    value={role.modelId || ''}
                    disabled={disabled}
                    onChange={(e) => updateRole(role.id, { modelId: e.target.value || null })}
                  >
                    <option value="">Session default{defaultModelId ? '' : ''}</option>
                    {modelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {role.kind === 'custom' && (
                <label className={styles.promptField}>
                  <span>System prompt override</span>
                  <textarea
                    value={role.systemPrompt || ''}
                    disabled={disabled}
                    placeholder="Optional custom instructions for this role"
                    rows={3}
                    onChange={(e) =>
                      updateRole(role.id, {
                        systemPrompt: e.target.value.trim() ? e.target.value : null,
                      })
                    }
                  />
                </label>
              )}

              {role.kind === 'reviewer' && (
                <div className={styles.row}>
                  <label className={styles.field}>
                    <span>On reject, retry</span>
                    <select
                      value={rejectEdge?.to || ''}
                      disabled={disabled}
                      onChange={(e) =>
                        setRejectTarget(role.id, e.target.value || null, rejectEdge?.maxTimes || 1)
                      }
                    >
                      <option value="">No retry</option>
                      {graph.roles
                        .filter((candidate) => candidate.id !== role.id)
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Max retries</span>
                    <input
                      type="number"
                      min={1}
                      max={3}
                      disabled={disabled || !rejectEdge}
                      value={rejectEdge?.maxTimes || 1}
                      onChange={(e) =>
                        setRejectTarget(
                          role.id,
                          rejectEdge?.to,
                          Math.max(1, Math.min(3, Number(e.target.value) || 1)),
                        )
                      }
                    />
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.addRow}>
        {KIND_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.addChip}
            disabled={disabled}
            onClick={() => addRole(option.value)}
          >
            + {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
