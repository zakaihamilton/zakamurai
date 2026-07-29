import { computeDiff } from '@/components/AI/Processor/utils/DiffEngine';
import type { ChangeSetStateShape } from '@/components/state/domain-types';
import type { Draft, StateStore } from '@/components/state/types';

export function createChangeSet({
  request = '',
  changes = [],
  validation = null,
}: {
  request?: string;
  changes?: Array<{ path: string; before?: string; after?: string }>;
  validation?: unknown;
}) {
  const files = changes.map(({ path, before = '', after }) => ({
    path,
    originalContent: before,
    proposedContent: after,
    deleted: after === undefined,
    hunks: after === undefined ? [] : computeDiff(before, after).diffs,
  }));
  return {
    id: `changeset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    request,
    files,
    validation,
    status: 'pending-review',
    createdAt: Date.now(),
  };
}

export function addChangeSet(
  changeSetState: StateStore<ChangeSetStateShape> | null | undefined,
  changeSet: ReturnType<typeof createChangeSet> | null | undefined,
) {
  if (!changeSetState || !changeSet) return;
  changeSetState((draft: Draft<ChangeSetStateShape>) => {
    draft.items = [...(draft.items || []), changeSet];
    draft.activeId = changeSet.id;
  });
}

export function updateChangeSetFile(
  changeSetState: StateStore<ChangeSetStateShape> | null | undefined,
  changeSetId: string,
  path: string,
  status: string,
) {
  if (!changeSetState || !changeSetId) return;
  changeSetState((draft: Draft<ChangeSetStateShape>) => {
    draft.items = (draft.items || []).map((set) => {
      if (set.id !== changeSetId) return set;
      const files = set.files.map((file) => (file.path === path ? { ...file, status } : file));
      const pending = files.some((file) => !file.status || file.status === 'pending-review');
      return { ...set, files, status: pending ? 'pending-review' : 'reviewed' };
    });
  });
}
