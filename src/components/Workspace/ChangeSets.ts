import { computeDiff } from '@/components/AI/Processor/utils/DiffEngine';
import type { ChangeSetStateShape } from '@/types/domain-types';
import type { Draft, StateStore } from 'triactor';

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

export function remapChangeSetPaths(
  changeSetState: StateStore<ChangeSetStateShape> | null | undefined,
  oldPrefix: string,
  newPrefix: string,
) {
  if (!changeSetState || !oldPrefix || !newPrefix || oldPrefix === newPrefix) return;
  changeSetState((draft: Draft<ChangeSetStateShape>) => {
    draft.items = (draft.items || []).map((set) => ({
      ...set,
      files: set.files.map((file) => ({
        ...file,
        path:
          file.path === oldPrefix || file.path.startsWith(`${oldPrefix}/`)
            ? newPrefix + file.path.substring(oldPrefix.length)
            : file.path,
      })),
    }));
  });
}

export function removeChangeSetPaths(
  changeSetState: StateStore<ChangeSetStateShape> | null | undefined,
  pathPrefix: string,
) {
  if (!changeSetState || !pathPrefix) return;
  changeSetState((draft: Draft<ChangeSetStateShape>) => {
    const items = (draft.items || [])
      .map((set) => {
        const files = set.files.filter(
          (file) => file.path !== pathPrefix && !file.path.startsWith(`${pathPrefix}/`),
        );
        if (files.length === 0) return null;
        const hasPendingFiles = files.some(
          (file) => !file.status || file.status === 'pending-review',
        );
        return { ...set, files, status: hasPendingFiles ? 'pending-review' : 'reviewed' };
      })
      .filter((set): set is NonNullable<typeof set> => set !== null);
    draft.items = items;
    if (!items.some((set) => set.id === draft.activeId)) {
      draft.activeId = items.at(-1)?.id || null;
    }
  });
}
