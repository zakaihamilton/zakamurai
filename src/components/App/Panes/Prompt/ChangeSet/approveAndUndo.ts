import {
  commitDirtyBufferContentsInDraft,
  readEffectiveFileContent,
  removeEditorPathStateInDraft,
} from '@/components/App/Views/EditorArea/EditorBuffers';
import {
  acquireFileOperation,
  releaseFileOperation,
} from '@/components/App/Views/EditorArea/FileOperations';
import Settings from '@/components/Storage/Settings';
import { updateChangeSetFile } from '@/components/Workspace';
import {
  type ChangeSetFileSystem,
  type StoreUpdater,
  hasExternalConflict,
  hasUnexpectedFile,
  isSamePendingDeletion,
  isSamePendingDiff,
  removePathsFromTabsAndSidebar,
} from '@/components/Workspace/changeSetFileOps';
import type { TabStateShape } from '@/types/domain-types';

export type PendingDiff = {
  originalContent: string;
  modifiedContent: string;
  isNewFile?: boolean;
  changeSetId?: string;
};

export type PendingDeletion = { originalContent: string; changeSetId?: string };

export type EditorDraft = {
  fileContents?: Record<string, string>;
  dirtyBufferContents?: Record<string, string>;
  pendingFileOperations?: Record<string, string>;
  pendingDiffs?: Record<string, PendingDiff>;
  pendingDeletions?: Record<string, PendingDeletion>;
};

export type BulkChangeSetParams = {
  changeSetId: string;
  editorState: StoreUpdater<EditorDraft>;
  changeSetState: StoreUpdater<{ items?: unknown[] }> | null;
  fs?: ChangeSetFileSystem | null;
  sidebarState?: StoreUpdater<{ folderTree?: unknown[] }> | null;
  tabState?: StoreUpdater<TabStateShape> | null;
  isWorkspaceCurrent?: () => boolean;
};

export type BulkChangeSetResult = { applied: number; rejected: number; conflicted: number };

const targetsFor = (editorState: StoreUpdater<EditorDraft>, changeSetId: string) => ({
  diffs: Object.entries(editorState.pendingDiffs || {}).filter(
    ([, diff]) => diff.changeSetId === changeSetId,
  ),
  deletions: Object.entries(editorState.pendingDeletions || {}).filter(
    ([, deletion]) => deletion.changeSetId === changeSetId,
  ),
});

function releaseLocks(
  editorState: StoreUpdater<EditorDraft>,
  operationTokens: Array<[string, string]>,
) {
  for (const [path, token] of operationTokens) {
    releaseFileOperation(editorState, path, token);
  }
}

export async function approveAllChangeSetChanges(
  params: BulkChangeSetParams,
): Promise<BulkChangeSetResult> {
  const isCurrent = () => params.isWorkspaceCurrent?.() ?? true;
  if (!isCurrent()) return { applied: 0, rejected: 0, conflicted: 0 };
  const { diffs, deletions } = targetsFor(params.editorState, params.changeSetId);
  const acceptedDiffs: Array<[string, PendingDiff]> = [];
  const acceptedDeletions: Array<[string, PendingDeletion]> = [];
  const operationTokens: Array<[string, string]> = [];
  let conflicted = 0;

  for (const [path, diff] of diffs) {
    if (!isCurrent()) break;
    const operationToken = acquireFileOperation(params.editorState, path);
    if (!operationToken) continue;
    operationTokens.push([path, operationToken]);
    const conflict = diff.isNewFile
      ? await hasUnexpectedFile(params.fs, path)
      : await hasExternalConflict(params.fs, path, diff.originalContent);
    if (!isCurrent()) break;
    if (conflict) {
      updateChangeSetFile(params.changeSetState as never, params.changeSetId, path, 'conflicted');
      conflicted++;
      continue;
    }
    if (!isSamePendingDiff(params.editorState.pendingDiffs?.[path], diff)) {
      continue;
    }
    const proposedContent =
      readEffectiveFileContent(params.editorState, path) ?? diff.modifiedContent;
    if (params.fs?.rootHandle && params.fs.writeFileAtPath) {
      try {
        const written = await params.fs.writeFileAtPath(
          path,
          proposedContent,
          params.fs.rootHandle,
        );
        if (!isCurrent()) break;
        if (written === false) continue;
      } catch (error) {
        if (!isCurrent()) break;
        console.error('Failed to approve change in filesystem:', path, error);
        continue;
      }
    }
    if (!isCurrent()) break;
    if (!isSamePendingDiff(params.editorState.pendingDiffs?.[path], diff)) {
      continue;
    }
    acceptedDiffs.push([path, diff]);
  }

  if (!isCurrent()) {
    releaseLocks(params.editorState, operationTokens);
    return { applied: acceptedDiffs.length, rejected: 0, conflicted };
  }

  for (const [path, deletion] of deletions) {
    if (!isCurrent()) break;
    const operationToken = acquireFileOperation(params.editorState, path);
    if (!operationToken) continue;
    operationTokens.push([path, operationToken]);
    if (!isSamePendingDeletion(params.editorState.pendingDeletions?.[path], deletion)) {
      continue;
    }
    const conflict = await hasExternalConflict(params.fs, path, deletion.originalContent);
    if (!isCurrent()) break;
    if (conflict) {
      updateChangeSetFile(params.changeSetState as never, params.changeSetId, path, 'conflicted');
      conflicted++;
      continue;
    }
    if (params.fs?.rootHandle && params.fs.deleteFileAtPath) {
      try {
        const deleted = await params.fs.deleteFileAtPath(path, params.fs.rootHandle);
        if (!isCurrent()) break;
        if (deleted === false) continue;
      } catch (error) {
        if (!isCurrent()) break;
        console.error('Failed to approve deletion in filesystem:', path, error);
        continue;
      }
    }
    if (!isCurrent()) break;
    if (!isSamePendingDeletion(params.editorState.pendingDeletions?.[path], deletion)) {
      continue;
    }
    acceptedDeletions.push([path, deletion]);
  }

  if (!isCurrent()) {
    releaseLocks(params.editorState, operationTokens);
    return { applied: acceptedDiffs.length + acceptedDeletions.length, rejected: 0, conflicted };
  }

  const removedDeletions: string[] = [];
  const removedDiffs: string[] = [];
  if (acceptedDiffs.length || acceptedDeletions.length) {
    let contents: Record<string, string> = {};
    let pendingDiffs: Record<string, PendingDiff> = {};
    let pendingDeletions: Record<string, PendingDeletion> = {};
    params.editorState((draft) => {
      commitDirtyBufferContentsInDraft(draft);
      const nextDiffs = { ...(draft.pendingDiffs || {}) };
      const nextDeletions = { ...(draft.pendingDeletions || {}) };
      const nextContents = { ...(draft.fileContents || {}) };
      for (const [path, expected] of acceptedDiffs) {
        if (isSamePendingDiff(nextDiffs[path], expected)) {
          delete nextDiffs[path];
          removedDiffs.push(path);
        }
      }
      for (const [path, expected] of acceptedDeletions) {
        if (!isSamePendingDeletion(nextDeletions[path], expected)) continue;
        delete nextDeletions[path];
        delete nextContents[path];
        removedDeletions.push(path);
      }
      draft.pendingDiffs = nextDiffs;
      draft.pendingDeletions = nextDeletions;
      draft.fileContents = nextContents;
      for (const path of removedDeletions) removeEditorPathStateInDraft(draft, path);
      contents = draft.fileContents || {};
      pendingDiffs = draft.pendingDiffs || {};
      pendingDeletions = draft.pendingDeletions || {};
    });
    void Settings.setFileContents?.(contents);
    void Settings.setPendingDiffs?.(pendingDiffs as never);
    void Settings.setPendingDeletions?.(pendingDeletions);
  }

  for (const path of removedDiffs) {
    updateChangeSetFile(params.changeSetState as never, params.changeSetId, path, 'accepted');
  }
  for (const path of removedDeletions) {
    updateChangeSetFile(params.changeSetState as never, params.changeSetId, path, 'accepted');
  }
  removePathsFromTabsAndSidebar({
    paths: removedDeletions,
    tabState: params.tabState,
    sidebarState: params.sidebarState,
  });
  releaseLocks(params.editorState, operationTokens);
  return {
    applied: removedDiffs.length + removedDeletions.length,
    rejected: 0,
    conflicted,
  };
}

export async function undoAllChangeSetChanges(
  params: BulkChangeSetParams,
): Promise<BulkChangeSetResult> {
  const isCurrent = () => params.isWorkspaceCurrent?.() ?? true;
  if (!isCurrent()) return { applied: 0, rejected: 0, conflicted: 0 };
  const { diffs, deletions } = targetsFor(params.editorState, params.changeSetId);
  const revertedDiffs: Array<[string, PendingDiff]> = [];
  const operationTokens: Array<[string, string]> = [];
  const removedNewFiles: string[] = [];
  let conflicted = 0;

  for (const [path, diff] of diffs) {
    if (!isCurrent()) break;
    const operationToken = acquireFileOperation(params.editorState, path);
    if (!operationToken) continue;
    operationTokens.push([path, operationToken]);
    if (!isSamePendingDiff(params.editorState.pendingDiffs?.[path], diff)) {
      continue;
    }
    const conflict = diff.isNewFile
      ? await hasUnexpectedFile(params.fs, path)
      : await hasExternalConflict(params.fs, path, diff.originalContent);
    if (!isCurrent()) break;
    if (conflict) {
      updateChangeSetFile(params.changeSetState as never, params.changeSetId, path, 'conflicted');
      conflicted++;
      continue;
    }
    if (!diff.isNewFile && params.fs?.rootHandle && params.fs.writeFileAtPath) {
      try {
        const written = await params.fs.writeFileAtPath(
          path,
          diff.originalContent,
          params.fs.rootHandle,
        );
        if (!isCurrent()) break;
        if (written === false) continue;
      } catch (error) {
        if (!isCurrent()) break;
        console.error('Failed to undo change in filesystem:', path, error);
        continue;
      }
    }
    if (!isCurrent()) break;
    revertedDiffs.push([path, diff]);
    updateChangeSetFile(params.changeSetState as never, params.changeSetId, path, 'rejected');
  }

  if (!isCurrent()) {
    releaseLocks(params.editorState, operationTokens);
    return { applied: 0, rejected: revertedDiffs.length, conflicted };
  }
  for (const [path] of deletions) {
    if (!isCurrent()) break;
    updateChangeSetFile(params.changeSetState as never, params.changeSetId, path, 'rejected');
  }
  if (!isCurrent()) {
    releaseLocks(params.editorState, operationTokens);
    return { applied: 0, rejected: revertedDiffs.length + deletions.length, conflicted };
  }

  let contents: Record<string, string> = {};
  let pendingDiffs: Record<string, PendingDiff> = {};
  let pendingDeletions: Record<string, PendingDeletion> = {};
  params.editorState((draft) => {
    commitDirtyBufferContentsInDraft(draft);
    const nextDiffs = { ...(draft.pendingDiffs || {}) };
    const nextDeletions = { ...(draft.pendingDeletions || {}) };
    const nextContents = { ...(draft.fileContents || {}) };
    for (const [path, diff] of revertedDiffs) {
      if (!isSamePendingDiff(nextDiffs[path], diff)) continue;
      if (diff.isNewFile) {
        delete nextContents[path];
        removedNewFiles.push(path);
      } else {
        nextContents[path] = diff.originalContent;
      }
      delete nextDiffs[path];
    }
    for (const [path, deletion] of deletions) {
      if (isSamePendingDeletion(nextDeletions[path], deletion)) {
        delete nextDeletions[path];
      }
    }
    draft.fileContents = nextContents;
    draft.pendingDiffs = nextDiffs;
    draft.pendingDeletions = nextDeletions;
    for (const path of removedNewFiles) {
      removeEditorPathStateInDraft(draft, path);
    }
    contents = draft.fileContents || {};
    pendingDiffs = draft.pendingDiffs || {};
    pendingDeletions = draft.pendingDeletions || {};
  });
  void Settings.setFileContents?.(contents);
  void Settings.setPendingDiffs?.(pendingDiffs as never);
  void Settings.setPendingDeletions?.(pendingDeletions);
  removePathsFromTabsAndSidebar({
    paths: removedNewFiles,
    tabState: params.tabState,
    sidebarState: params.sidebarState,
  });
  releaseLocks(params.editorState, operationTokens);
  return {
    applied: 0,
    rejected: revertedDiffs.length + deletions.length,
    conflicted,
  };
}
