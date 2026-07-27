import { computeDiff } from '@/components/AI/Processor/utils/DiffEngine';

export function createChangeSet({ request = '', changes = [], validation = null }) {
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

export function addChangeSet(changeSetState, changeSet) {
  if (!changeSetState || !changeSet) return;
  changeSetState((draft) => {
    draft.items = [...(draft.items || []), changeSet];
    draft.activeId = changeSet.id;
  });
}

export function updateChangeSetFile(changeSetState, changeSetId, path, status) {
  if (!changeSetState || !changeSetId) return;
  changeSetState((draft) => {
    draft.items = (draft.items || []).map((set) => {
      if (set.id !== changeSetId) return set;
      const files = set.files.map((file) => (file.path === path ? { ...file, status } : file));
      const pending = files.some((file) => !file.status || file.status === 'pending-review');
      return { ...set, files, status: pending ? 'pending-review' : 'reviewed' };
    });
  });
}
