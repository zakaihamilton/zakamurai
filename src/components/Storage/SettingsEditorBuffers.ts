import { reportDiagnostic } from '@/components/Diagnostics';
import { isStringRecord, normalizeRecoveryCheckpoint } from '@/contracts/runtime';
import type { ChangeSet, LogEntry, PendingDiff } from '@/types/domain-types';
import {
  LARGE_IDB_KEYS,
  MAX_PERSISTED_AI_LOGS,
  SETTINGS_KEYS,
  clearLegacyLocal,
  createEmptyLargeCache,
  createLargeWriteGenerations,
  readLegacyLocal,
  writeStorageItem,
} from './SettingsKeys';
import { createLargePersistence } from './SettingsLargePersistence';
import {
  MAX_RECOVERY_CHECKPOINTS,
  RECOVERY_CHECKPOINT_HISTORY_KEY,
  RECOVERY_CHECKPOINT_KEY,
  appendRecoveryCheckpoint,
  createRecoveryCheckpoint,
  shouldPreserveRecoveryCheckpoint,
} from './SettingsRecovery';
import { normalizePendingDeletions, normalizePendingDiffs } from './SettingsSerialization';
import { idbClear, idbGet, idbSet } from './idbStore';
import type { LargeCache, LargeCacheKey, RecoveryCheckpoint, StorageLayer } from './storage-types';

type PendingDeletionsMap = Record<
  string,
  boolean | { originalContent?: string; changeSetId?: string }
>;

type EditorBufferDependencies = {
  recordStorageSuccess: (layer: StorageLayer) => Promise<void>;
  recordStorageFailure: (message: string) => void;
  getFacade: () => {
    setFileContents: (contents: Record<string, string> | null) => Promise<boolean>;
    setPendingDiffs: (diffs: Record<string, PendingDiff> | null) => Promise<boolean>;
    setPendingDeletions: (deletions: PendingDeletionsMap | null) => Promise<boolean>;
    saveRecoveryCheckpoint: (snapshot: Partial<RecoveryCheckpoint>) => Promise<boolean>;
  };
};

export function createSettingsEditorBuffers({
  recordStorageSuccess,
  recordStorageFailure,
  getFacade,
}: EditorBufferDependencies) {
  const largeCache = createEmptyLargeCache();
  const largeWriteGen = createLargeWriteGenerations();
  let hydratePromise: Promise<boolean> | null = null;
  let hydrated = false;
  let recoveryCheckpoint: RecoveryCheckpoint | null = null;
  let recoveryCheckpointHistory: RecoveryCheckpoint[] = [];

  // Keep coordinated editor snapshots in order so a slower earlier write cannot
  // land after a newer content/diff/deletion/recovery snapshot.
  let editorBufferWriteQueue: Promise<void> = Promise.resolve();
  let editorBufferWriteGeneration = 0;
  let editorBufferWritesPaused = 0;

  const largePersistence = createLargePersistence({
    cache: largeCache,
    idbKeys: LARGE_IDB_KEYS,
    writeGenerations: largeWriteGen,
    idbSet,
    clearLegacyLocal,
    writeLocalFallback: writeStorageItem,
    recordStorageSuccess,
    recordStorageFailure,
  });

  const resetMemoryCache = () => {
    Object.assign(largeCache, createEmptyLargeCache());
    recoveryCheckpoint = null;
    recoveryCheckpointHistory = [];
  };

  return {
    getAILogs() {
      return Array.isArray(largeCache.aiLogs) ? largeCache.aiLogs : [];
    },

    async setAILogs(logs: LogEntry[]) {
      const logsToSave = (logs || []).slice(-MAX_PERSISTED_AI_LOGS);
      return largePersistence.write('aiLogs', logsToSave);
    },

    getFileContents() {
      return largeCache.fileContents;
    },

    async setFileContents(contents: Record<string, string> | null) {
      return largePersistence.write(
        'fileContents',
        contents && typeof contents === 'object' ? contents : {},
      );
    },

    getPendingDiffs() {
      return normalizePendingDiffs(largeCache.pendingDiffs);
    },

    async setPendingDiffs(diffs: Record<string, PendingDiff> | null) {
      const next = normalizePendingDiffs(diffs);
      return largePersistence.write('pendingDiffs', next);
    },

    getPendingDeletions() {
      return largeCache.pendingDeletions === null
        ? null
        : normalizePendingDeletions(largeCache.pendingDeletions);
    },

    async setPendingDeletions(deletions: PendingDeletionsMap | null) {
      const next = normalizePendingDeletions(deletions);
      return largePersistence.write('pendingDeletions', next);
    },

    /** Persists one coordinated editor snapshot without changing the stored record shape. */
    async persistEditorBuffersSnapshot({
      fileContents,
      pendingDiffs,
      pendingDeletions,
      recovery,
    }: {
      fileContents: Record<string, string>;
      pendingDiffs: Record<string, PendingDiff>;
      pendingDeletions: PendingDeletionsMap;
      recovery: Partial<RecoveryCheckpoint>;
    }) {
      if (editorBufferWritesPaused > 0) return undefined;
      const normalizedDiffs = normalizePendingDiffs(pendingDiffs);
      for (const [path, diff] of Object.entries(normalizedDiffs)) {
        diff.modifiedContent = fileContents[path] ?? diff.modifiedContent ?? '';
      }
      const normalizedDeletions = normalizePendingDeletions(pendingDeletions);
      const generation = editorBufferWriteGeneration;
      const facade = getFacade();
      const writeSnapshot = async () => {
        if (editorBufferWritesPaused > 0 || generation !== editorBufferWriteGeneration) {
          return undefined;
        }
        try {
          const [contentsOk, diffsOk, deletionsOk, checkpointOk] = await Promise.all([
            facade.setFileContents(fileContents),
            facade.setPendingDiffs(normalizedDiffs),
            facade.setPendingDeletions(normalizedDeletions),
            facade.saveRecoveryCheckpoint({
              ...recovery,
              fileContents,
              pendingDiffs: normalizedDiffs,
              pendingDeletions: normalizedDeletions,
            }),
          ]);
          return contentsOk && diffsOk && deletionsOk && checkpointOk;
        } catch {
          return false;
        }
      };
      const queuedWrite = editorBufferWriteQueue.then(writeSnapshot, writeSnapshot);
      editorBufferWriteQueue = queuedWrite.then(
        () => undefined,
        () => undefined,
      );
      return queuedWrite;
    },

    /** Synchronous unload flush for editor buffers. Prefer this in beforeunload handlers. */
    flushEditorBuffersSync(
      fileContents: Record<string, string> | null,
      pendingDiffs: Record<string, PendingDiff> | null,
      pendingDeletions: PendingDeletionsMap | null = {},
    ) {
      if (editorBufferWritesPaused > 0) return false;
      const contentsOk = largePersistence.persistSync(
        'fileContents',
        fileContents && typeof fileContents === 'object' ? fileContents : {},
      );
      const diffsOk = largePersistence.persistSync(
        'pendingDiffs',
        normalizePendingDiffs(pendingDiffs),
      );
      const deletionsOk = largePersistence.persistSync(
        'pendingDeletions',
        normalizePendingDeletions(pendingDeletions),
      );
      return contentsOk && diffsOk && deletionsOk;
    },

    getPreviewHtml() {
      return largeCache.previewHtml;
    },

    async setPreviewHtml(html: string | null) {
      return largePersistence.write('previewHtml', html || null);
    },

    /** Prevent editor autosaves from repopulating storage during a project reset. */
    pauseEditorBufferWrites() {
      editorBufferWritesPaused += 1;
    },

    /** Resume coordinated editor saves after the reset state and starter are installed. */
    resumeEditorBufferWrites() {
      editorBufferWritesPaused = Math.max(0, editorBufferWritesPaused - 1);
    },

    getAgentSessions() {
      const parsed = largeCache.agentSessions;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed;
    },

    async setAgentSessions(payload: Record<string, unknown> | null) {
      if (!payload || typeof payload !== 'object') {
        return largePersistence.write('agentSessions', null);
      }
      return largePersistence.write('agentSessions', payload);
    },

    getChangeSets() {
      const value = largeCache.changeSets;
      return value && typeof value === 'object' ? value : { activeId: null, items: [] };
    },

    async setChangeSets(changeSets: { activeId?: string | null; items?: ChangeSet[] } | null) {
      const items = Array.isArray(changeSets?.items) ? changeSets.items.slice(-20) : [];
      return largePersistence.write('changeSets', {
        activeId: changeSets?.activeId || null,
        items,
      });
    },

    getRecoveryCheckpoint() {
      return recoveryCheckpoint ? { ...recoveryCheckpoint } : null;
    },

    getRecoveryCheckpoints() {
      return recoveryCheckpointHistory.map((checkpoint) => ({ ...checkpoint }));
    },

    async saveRecoveryCheckpoint(snapshot: Partial<RecoveryCheckpoint>) {
      if (shouldPreserveRecoveryCheckpoint(snapshot.reason, recoveryCheckpoint?.reason)) {
        return true;
      }
      const checkpoint = normalizeRecoveryCheckpoint(createRecoveryCheckpoint(snapshot));
      if (!checkpoint) return false;
      const saved = await idbSet(RECOVERY_CHECKPOINT_KEY, checkpoint);
      // Keep the in-memory checkpoint even when durable browser storage is unavailable.
      // This preserves same-session restore while the false return value still lets callers
      // communicate that the checkpoint will not survive a reload.
      recoveryCheckpoint = checkpoint;
      if (checkpoint.reason !== 'storage-recovery') {
        recoveryCheckpointHistory = appendRecoveryCheckpoint(recoveryCheckpointHistory, checkpoint);
        await idbSet(RECOVERY_CHECKPOINT_HISTORY_KEY, recoveryCheckpointHistory);
      }
      if (!saved) {
        reportDiagnostic({
          source: 'storage',
          severity: 'warning',
          message: 'Recovery checkpoint could not be written to IndexedDB.',
        });
      }
      return saved;
    },

    /**
     * Load large project blobs from IndexedDB (migrating legacy localStorage once).
     * Call before reading fileContents / pendingDiffs / previewHtml / sessions / logs.
     */
    async hydrate() {
      if (hydrated) return true;
      if (hydratePromise) return hydratePromise;

      hydratePromise = (async () => {
        recoveryCheckpoint = normalizeRecoveryCheckpoint(await idbGet(RECOVERY_CHECKPOINT_KEY));
        const storedHistory = await idbGet(RECOVERY_CHECKPOINT_HISTORY_KEY);
        recoveryCheckpointHistory = Array.isArray(storedHistory)
          ? storedHistory
              .map((item) => normalizeRecoveryCheckpoint(item))
              .filter((item): item is RecoveryCheckpoint => item !== null)
              .slice(-MAX_RECOVERY_CHECKPOINTS)
          : [];
        if (!recoveryCheckpointHistory.length && recoveryCheckpoint) {
          recoveryCheckpointHistory = [recoveryCheckpoint];
        }
        async function loadOne<T>(
          cacheKey: LargeCacheKey,
          fallback: T,
          { raw = false }: { raw?: boolean } = {},
        ) {
          const idbKey = LARGE_IDB_KEYS[cacheKey];
          const legacy = readLegacyLocal(idbKey, fallback, { raw });
          const hasLegacy = legacy != null && legacy !== fallback;
          let value = hasLegacy ? legacy : await idbGet(idbKey);

          if (hasLegacy) {
            // Promote fresher/migrating localStorage into IDB, then free the legacy slot.
            const durable = await idbSet(idbKey, legacy);
            if (durable) clearLegacyLocal(idbKey);
          } else if (value == null) {
            value = fallback;
          }

          largePersistence.setValue(
            cacheKey,
            (value == null ? fallback : value) as LargeCache[typeof cacheKey],
          );
        }

        await Promise.all([
          loadOne('fileContents', null),
          loadOne('pendingDiffs', {}),
          loadOne('pendingDeletions', null),
          loadOne('previewHtml', null, { raw: true }),
          loadOne('agentSessions', null),
          loadOne('aiLogs', []),
          loadOne('changeSets', { activeId: null, items: [] }),
        ]);

        largeCache.pendingDiffs = normalizePendingDiffs(largeCache.pendingDiffs);
        if (largeCache.pendingDeletions !== null) {
          largeCache.pendingDeletions = normalizePendingDeletions(largeCache.pendingDeletions);
        }
        if (!isStringRecord(largeCache.fileContents) && recoveryCheckpoint) {
          largeCache.fileContents = recoveryCheckpoint.fileContents;
          largeCache.pendingDiffs = normalizePendingDiffs(recoveryCheckpoint.pendingDiffs);
          if (largeCache.pendingDeletions === null) {
            largeCache.pendingDeletions = normalizePendingDeletions(
              recoveryCheckpoint.pendingDeletions,
            );
          }
          reportDiagnostic({
            source: 'storage',
            severity: 'warning',
            message: 'Recovered workspace buffers from the last valid recovery checkpoint.',
          });
        }
        if (!Array.isArray(largeCache.aiLogs)) largeCache.aiLogs = [];
        if (!largeCache.changeSets || typeof largeCache.changeSets !== 'object') {
          largeCache.changeSets = { activeId: null, items: [] };
        }
        hydrated = true;
        return true;
      })().catch((e) => {
        console.warn('Settings.hydrate failed; using empty large-store defaults', e);
        hydrated = true;
        return false;
      });

      return hydratePromise;
    },

    isHydrated() {
      return hydrated;
    },

    /** Test helper: reset in-memory hydration state. */
    _resetHydrationForTests() {
      hydratePromise = null;
      hydrated = false;
      resetMemoryCache();
      Object.assign(largeWriteGen, createLargeWriteGenerations());
    },

    async resetBuffers() {
      editorBufferWriteGeneration += 1;
      // Fence saves that were already in flight before clearing the project. The
      // IndexedDB clear waits for those writes, while the generation fence keeps
      // their localStorage fallback from repopulating the reset workspace.
      largePersistence.invalidateWrites();
      await editorBufferWriteQueue;
      for (const key of Object.values(SETTINGS_KEYS)) {
        clearLegacyLocal(key);
      }
      await idbClear();
      resetMemoryCache();
    },
  };
}
