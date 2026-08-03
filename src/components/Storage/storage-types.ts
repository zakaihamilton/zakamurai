import type { ChangeSet, LogEntry, PendingDiff } from '@/components/state/domain-types';
import type { RecoveryCheckpoint } from '@/contracts/runtime';

export type LargeCacheKey =
  | 'fileContents'
  | 'pendingDiffs'
  | 'pendingDeletions'
  | 'previewHtml'
  | 'agentSessions'
  | 'aiLogs'
  | 'changeSets';

export interface LargeCache {
  fileContents: Record<string, string> | null;
  pendingDiffs: Record<string, PendingDiff>;
  pendingDeletions: Record<
    string,
    boolean | { originalContent?: string; changeSetId?: string }
  > | null;
  previewHtml: string | null;
  agentSessions: Record<string, unknown> | null;
  aiLogs: LogEntry[];
  changeSets: { activeId: string | null; items: ChangeSet[] };
}

export type { RecoveryCheckpoint };

export type StorageLayer = 'indexeddb' | 'localStorage';

export interface SettingsStorageHealth {
  status: string;
  layer: string | null;
  message: string | null;
  quotaWarning: boolean;
  usage: number | null;
  quota: number | null;
  lastSuccessfulPersistAt: number | null;
}
