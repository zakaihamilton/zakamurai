import { ROLE_KIND_DEFAULTS } from '@/components/AI/Agent/Roles';
import { Icons } from '@/components/ui/Icons';
import React from 'react';
import styles from './RoleCard.module.css';

export default function RoleCard({
  role,
  index,
  roleCount,
  kindOptions,
  modelOptions = [],
  defaultModelId = '',
  rejectEdge = null,
  otherRoles = [],
  disabled = false,
  onUpdateLabel,
  onMoveUp,
  onMoveDown,
  onRemove,
  onChangeKind,
  onChangeModel,
  onChangeSystemPrompt,
  onChangeRejectTarget,
  onChangeRejectMaxTimes,
}) {
  return (
    <div className={styles.card} data-role-id={role.id}>
      <div className={styles.cardTop}>
        <span className={styles.index}>{index + 1}</span>
        <input
          className={styles.labelInput}
          value={role.label}
          disabled={disabled}
          aria-label={`Role ${index + 1} label`}
          onChange={(e) => onUpdateLabel?.(e.target.value)}
        />
        <div className={styles.moveActions}>
          <button
            type="button"
            className={styles.iconBtn}
            disabled={disabled || index === 0}
            onClick={onMoveUp}
            aria-label={`Move ${role.label} up`}
          >
            ↑
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            disabled={disabled || index === roleCount - 1}
            onClick={onMoveDown}
            aria-label={`Move ${role.label} down`}
          >
            ↓
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            disabled={disabled || roleCount <= 1}
            onClick={onRemove}
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
              onChangeKind?.(kind, ROLE_KIND_DEFAULTS[kind]?.label || role.label);
            }}
          >
            {kindOptions.map((option) => (
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
            onChange={(e) => onChangeModel?.(e.target.value || null)}
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
            onChange={(e) => onChangeSystemPrompt?.(e.target.value.trim() ? e.target.value : null)}
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
                onChangeRejectTarget?.(e.target.value || null, rejectEdge?.maxTimes || 1)
              }
            >
              <option value="">No retry</option>
              {otherRoles.map((candidate) => (
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
                onChangeRejectMaxTimes?.(Math.max(1, Math.min(3, Number(e.target.value) || 1)))
              }
            />
          </label>
        </div>
      )}
    </div>
  );
}
