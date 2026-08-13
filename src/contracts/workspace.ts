import type { PendingDiff, Tab } from '@/types/domain-types';

export type WorkspaceSnapshot = {
  version: 1;
  id: string;
  savedAt: number;
  reason: 'manual' | 'ai-change' | 'storage-recovery';
  projectName: string;
  fileContents: Record<string, string>;
  pendingDiffs: Record<string, PendingDiff>;
  pendingDeletions: Record<string, unknown>;
  openTabs: Tab[];
  activeTabId: string | null;
};

export function createWorkspaceSnapshot(
  input: Omit<WorkspaceSnapshot, 'version' | 'id' | 'savedAt'>,
): WorkspaceSnapshot {
  return {
    version: 1,
    id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: Date.now(),
    ...input,
  };
}
