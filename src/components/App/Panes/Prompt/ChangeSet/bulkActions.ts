import { removeNodeAtPath } from '@/components/App/Panes/Sidebar/TreeUtils';
import { removeLastCodeTabPathInDraft } from '@/components/App/Panes/TabBar/TabStateUtils';
import {
  commitDirtyBufferContentsInDraft,
  readEffectiveFileContent,
} from '@/components/App/Views/EditorArea/EditorBuffers';
import { removeEditorPathStateInDraft } from '@/components/App/Views/EditorArea/EditorBuffers';
import {
  acquireFileOperation,
  releaseFileOperation,
} from '@/components/App/Views/EditorArea/FileOperations';
import Settings from '@/components/Storage/Settings';
import { updateChangeSetFile } from '@/components/Workspace';
import type { TabStateShape } from '@/types/domain-types';

type PendingDiff = {
  originalContent: string;
  modifiedContent: string;
  isNewFile?: boolean;
  changeSetId?: string;
};

type PendingDeletion = { originalContent: string; changeSetId?: string };

type Store<T> = ((updater: (draft: T) => void) => void) & T;

type EditorDraft = {
  fileContents?: Record<string, string>;
  dirtyBufferContents?: Record<string, string>;
  pendingFileOperations?: Record<string, string>;
  pendingDiffs?: Record<string, PendingDiff>;
  pendingDeletions?: Record<string, PendingDeletion>;
};

type FileSystem = {
  rootHandle?: FileSystemDirectoryHandle | null;
  readFileAtPath?: (path: string, root?: FileSystemDirectoryHandle | null) => Promise<string>;
  writeFileAtPath?: (
    path: string,
    content: string,
    root?: FileSystemDirectoryHandle | null,
  ) => Promise<boolean | undefined>;
  deleteFileAtPath?: (
    path: string,
    root?: FileSystemDirectoryHandle | null,
  ) => Promise<boolean | undefined>;
  getFileHandleAtPath?: (
    path: string,
    root?: FileSystemDirectoryHandle | null,
  ) => Promise<FileSystemFileHandle | null>;
};

type Params = {
  changeSetId: string;
  editorState: Store<EditorDraft>;
  changeSetState: Store<{ items?: unknown[] }> | null;
  fs?: FileSystem | null;
  sidebarState?: Store<{ folderTree?: unknown[] }> | null;
  tabState?: Store<TabStateShape> | null;
  isWorkspaceCurrent?: () => boolean;
};

type Result = { applied: number; rejected: number; conflicted: number };

const hasExternalConflict = async (
  fs: FileSystem | null | undefined,
  path: string,
  expected: string,
) => {
  if (!fs?.rootHandle || !fs.readFileAtPath) return false;
  try {
    return (await fs.readFileAtPath(path, fs.rootHandle)) !== expected;
  } catch {
    return true;
  }
};

const hasUnexpectedFile = async (fs: FileSystem | null | undefined, path: string) => {
  if (!fs?.rootHandle) return false;
  if (!fs.getFileHandleAtPath) return true;
  try {
    return Boolean(await fs.getFileHandleAtPath(path, fs.rootHandle));
  } catch {
    return true;
  }
};

const targetsFor = (editorState: Store<EditorDraft>, changeSetId: string) => ({
  diffs: Object.entries(editorState.pendingDiffs || {}).filter(
    ([, diff]) => diff.changeSetId === changeSetId,
  ),
  deletions: Object.entries(editorState.pendingDeletions || {}).filter(
    ([, deletion]) => deletion.changeSetId === changeSetId,
  ),
});

export async function approveAllChangeSetChanges(params: Params): Promise<Result> {
  const isCurrent = () => params.isWorkspaceCurrent?.() ?? true;
  if (!isCurrent()) return { applied: 0, rejected: 0, conflicted: 0 };
  const { diffs, deletions } = targetsFor(params.editorState, params.changeSetId);
  const acceptedDiffs: Array<[string, PendingDiff]> = [];
  const acceptedDeletions: Array<[string, PendingDeletion]> = [];
  const operationTokens: Array<[string, string]> = [];
  let conflicted = 0;
  const releaseOperationLocks = () => {
    for (const [path, token] of operationTokens) {
      releaseFileOperation(params.editorState, path, token);
    }
  };

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
    const currentDiff = params.editorState.pendingDiffs?.[path];
    if (
      !currentDiff ||
      currentDiff.changeSetId !== diff.changeSetId ||
      currentDiff.originalContent !== diff.originalContent ||
      currentDiff.modifiedContent !== diff.modifiedContent ||
      currentDiff.isNewFile !== diff.isNewFile
    ) {
      continue;
    }
    const proposedContent =
      readEffectiveFileContent(params.editorState, path) ?? diff.modifiedContent;
    if (params.fs?.rootHandle && params.fs.writeFileAtPath) {
      try {
        const rootHandle = params.fs.rootHandle;
        const written = await params.fs.writeFileAtPath(path, proposedContent, rootHandle);
        if (!isCurrent()) break;
        if (written === false) continue;
      } catch (error) {
        if (!isCurrent()) break;
        console.error('Failed to approve change in filesystem:', path, error);
        continue;
      }
    }
    if (!isCurrent()) break;
    const savedDiff = params.editorState.pendingDiffs?.[path];
    if (
      !savedDiff ||
      savedDiff.changeSetId !== diff.changeSetId ||
      savedDiff.originalContent !== diff.originalContent ||
      savedDiff.modifiedContent !== diff.modifiedContent ||
      savedDiff.isNewFile !== diff.isNewFile
    ) {
      continue;
    }
    acceptedDiffs.push([path, diff]);
  }

  if (!isCurrent()) {
    releaseOperationLocks();
    return { applied: acceptedDiffs.length, rejected: 0, conflicted };
  }
  for (const [path, deletion] of deletions) {
    if (!isCurrent()) break;
    const operationToken = acquireFileOperation(params.editorState, path);
    if (!operationToken) continue;
    operationTokens.push([path, operationToken]);
    const currentDeletion = params.editorState.pendingDeletions?.[path];
    if (
      !currentDeletion ||
      currentDeletion.changeSetId !== deletion.changeSetId ||
      currentDeletion.originalContent !== deletion.originalContent
    ) {
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
        const rootHandle = params.fs.rootHandle;
        const deleted = await params.fs.deleteFileAtPath(path, rootHandle);
        if (!isCurrent()) break;
        if (deleted === false) continue;
      } catch (error) {
        if (!isCurrent()) break;
        console.error('Failed to approve deletion in filesystem:', path, error);
        continue;
      }
    }
    if (!isCurrent()) break;
    const savedDeletion = params.editorState.pendingDeletions?.[path];
    if (
      !savedDeletion ||
      savedDeletion.changeSetId !== deletion.changeSetId ||
      savedDeletion.originalContent !== deletion.originalContent
    ) {
      continue;
    }
    acceptedDeletions.push([path, deletion]);
  }

  if (!isCurrent()) {
    releaseOperationLocks();
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
        const current = nextDiffs[path];
        if (
          current?.changeSetId === expected.changeSetId &&
          current.originalContent === expected.originalContent &&
          current.modifiedContent === expected.modifiedContent &&
          current.isNewFile === expected.isNewFile
        ) {
          delete nextDiffs[path];
          removedDiffs.push(path);
        }
      }
      for (const [path, expected] of acceptedDeletions) {
        const current = nextDeletions[path];
        if (
          current?.changeSetId !== expected.changeSetId ||
          current.originalContent !== expected.originalContent
        ) {
          continue;
        }
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
  if (removedDeletions.length) {
    params.tabState?.((draft) => {
      draft.openTabs = draft.openTabs.filter((tab) => !removedDeletions.includes(tab.id));
      if (draft.activeTabId && removedDeletions.includes(draft.activeTabId)) {
        draft.activeTabId = draft.openTabs.at(-1)?.id || null;
      }
      removeLastCodeTabPathInDraft(draft, removedDeletions);
    });
    params.sidebarState?.((draft) => {
      for (const path of removedDeletions) {
        if (draft.folderTree) {
          draft.folderTree = removeNodeAtPath(
            draft.folderTree as Parameters<typeof removeNodeAtPath>[0],
            path.split('/').filter(Boolean),
          );
        }
      }
    });
  }
  releaseOperationLocks();
  return {
    applied: removedDiffs.length + removedDeletions.length,
    rejected: 0,
    conflicted,
  };
}

export async function undoAllChangeSetChanges(params: Params): Promise<Result> {
  const isCurrent = () => params.isWorkspaceCurrent?.() ?? true;
  if (!isCurrent()) return { applied: 0, rejected: 0, conflicted: 0 };
  const { diffs, deletions } = targetsFor(params.editorState, params.changeSetId);
  const revertedDiffs: Array<[string, PendingDiff]> = [];
  const operationTokens: Array<[string, string]> = [];
  const removedNewFiles: string[] = [];
  let conflicted = 0;
  const releaseOperationLocks = () => {
    for (const [path, token] of operationTokens) {
      releaseFileOperation(params.editorState, path, token);
    }
  };
  for (const [path, diff] of diffs) {
    if (!isCurrent()) break;
    const operationToken = acquireFileOperation(params.editorState, path);
    if (!operationToken) continue;
    operationTokens.push([path, operationToken]);
    const currentDiff = params.editorState.pendingDiffs?.[path];
    if (
      !currentDiff ||
      currentDiff.changeSetId !== diff.changeSetId ||
      currentDiff.originalContent !== diff.originalContent ||
      currentDiff.modifiedContent !== diff.modifiedContent ||
      currentDiff.isNewFile !== diff.isNewFile
    ) {
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
        const rootHandle = params.fs.rootHandle;
        const written = await params.fs.writeFileAtPath(path, diff.originalContent, rootHandle);
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
    releaseOperationLocks();
    return { applied: 0, rejected: revertedDiffs.length, conflicted };
  }
  for (const [path] of deletions) {
    if (!isCurrent()) break;
    updateChangeSetFile(params.changeSetState as never, params.changeSetId, path, 'rejected');
  }
  if (!isCurrent()) {
    releaseOperationLocks();
    return { applied: 0, rejected: revertedDiffs.length + deletions.length, conflicted };
  }
  let contents: Record<string, string> = {};
  let pendingDiffs: Record<string, PendingDiff> = {};
  let pendingDeletions: Record<string, PendingDeletion> = {};
  if (!isCurrent()) {
    releaseOperationLocks();
    return { applied: 0, rejected: revertedDiffs.length + deletions.length, conflicted };
  }
  params.editorState((draft) => {
    commitDirtyBufferContentsInDraft(draft);
    const nextDiffs = { ...(draft.pendingDiffs || {}) };
    const nextDeletions = { ...(draft.pendingDeletions || {}) };
    const nextContents = { ...(draft.fileContents || {}) };
    for (const [path, diff] of revertedDiffs) {
      const current = nextDiffs[path];
      if (
        current?.changeSetId !== diff.changeSetId ||
        current.originalContent !== diff.originalContent ||
        current.modifiedContent !== diff.modifiedContent ||
        current.isNewFile !== diff.isNewFile
      ) {
        continue;
      }
      if (diff.isNewFile) {
        delete nextContents[path];
        removedNewFiles.push(path);
      } else {
        nextContents[path] = diff.originalContent;
      }
      delete nextDiffs[path];
    }
    for (const [path, deletion] of deletions) {
      const current = nextDeletions[path];
      if (
        current?.changeSetId === deletion.changeSetId &&
        current.originalContent === deletion.originalContent
      ) {
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
  if (removedNewFiles.length) {
    params.tabState?.((draft) => {
      draft.openTabs = draft.openTabs.filter(
        (tab) => !removedNewFiles.some((path) => tab.id === path || tab.id.startsWith(`${path}/`)),
      );
      const activeTabId = draft.activeTabId;
      if (
        activeTabId &&
        removedNewFiles.some((path) => activeTabId === path || activeTabId.startsWith(`${path}/`))
      ) {
        draft.activeTabId = draft.openTabs.at(-1)?.id || null;
      }
      removeLastCodeTabPathInDraft(draft, removedNewFiles);
    });
    params.sidebarState?.((draft) => {
      for (const path of removedNewFiles) {
        if (draft.folderTree) {
          draft.folderTree = removeNodeAtPath(
            draft.folderTree as Parameters<typeof removeNodeAtPath>[0],
            path.split('/').filter(Boolean),
          );
        }
      }
    });
  }
  releaseOperationLocks();
  return {
    applied: 0,
    rejected: revertedDiffs.length + deletions.length,
    conflicted,
  };
}

export async function rewindToChangeSetCheckpoint({
  changeSetId,
  editorState,
  changeSetState,
  fs,
  sidebarState,
  tabState,
}: {
  changeSetId: string;
  editorState: Store<EditorDraft>;
  changeSetState: Store<{
    activeId?: string | null;
    items?: Array<{
      id: string;
      files: Array<{
        path: string;
        originalContent?: string;
        proposedContent?: string;
        deleted?: boolean;
      }>;
    }>;
  }> | null;
  fs?: FileSystem | null;
  sidebarState?: Store<{ folderTree?: unknown[] }> | null;
  tabState?: Store<TabStateShape> | null;
}): Promise<{ restoredFiles: number }> {
  const items = changeSetState?.items || [];
  const targetIndex = items.findIndex((item) => item.id === changeSetId);
  if (targetIndex < 0) return { restoredFiles: 0 };

  const setsToRewind = items.slice(targetIndex).reverse();
  const restoreMap = new Map<string, string | undefined>();
  for (const set of setsToRewind) {
    for (const file of set.files) {
      const original = file.originalContent ?? '';
      const wasNewFile = !file.deleted && original === '';
      restoreMap.set(file.path, wasNewFile ? undefined : original);
    }
  }

  const removedPaths: string[] = [];
  if (fs?.rootHandle) {
    for (const [path, content] of restoreMap.entries()) {
      try {
        if (content === undefined) {
          await fs.deleteFileAtPath?.(path, fs.rootHandle);
        } else {
          await fs.writeFileAtPath?.(path, content, fs.rootHandle);
        }
      } catch {
        // Best-effort local FS sync
      }
    }
  }

  let nextContentsSnapshot: Record<string, string> = {};
  editorState((draft) => {
    commitDirtyBufferContentsInDraft(draft);
    const nextContents = { ...(draft.fileContents || {}) };
    const nextDiffs = { ...(draft.pendingDiffs || {}) };
    const nextDeletions = { ...(draft.pendingDeletions || {}) };

    for (const [path, content] of restoreMap.entries()) {
      delete nextDiffs[path];
      delete nextDeletions[path];
      if (content === undefined) {
        delete nextContents[path];
        removedPaths.push(path);
      } else {
        nextContents[path] = content;
      }
    }

    draft.fileContents = nextContents;
    draft.pendingDiffs = nextDiffs;
    draft.pendingDeletions = nextDeletions;
    for (const path of removedPaths) {
      removeEditorPathStateInDraft(draft, path);
    }
    nextContentsSnapshot = nextContents;
  });

  void Settings.setFileContents?.(nextContentsSnapshot);
  if (removedPaths.length) {
    tabState?.((draft) => {
      draft.openTabs = draft.openTabs.filter(
        (tab) => !removedPaths.some((path) => tab.id === path || tab.id.startsWith(`${path}/`)),
      );
      removeLastCodeTabPathInDraft(draft, removedPaths);
    });
    sidebarState?.((draft) => {
      for (const path of removedPaths) {
        if (draft.folderTree) {
          draft.folderTree = removeNodeAtPath(
            draft.folderTree as Parameters<typeof removeNodeAtPath>[0],
            path.split('/').filter(Boolean),
          );
        }
      }
    });
  }

  changeSetState?.((draft) => {
    const remaining = (draft.items || []).slice(0, targetIndex);
    draft.items = remaining;
    draft.activeId = remaining.at(-1)?.id || null;
  });

  return { restoredFiles: restoreMap.size };
}
