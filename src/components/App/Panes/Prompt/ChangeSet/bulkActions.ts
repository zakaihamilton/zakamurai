import { removeNodeAtPath } from '@/components/App/Panes/Sidebar/TreeUtils';
import Settings from '@/components/Storage/Settings';
import { updateChangeSetFile } from '@/components/Workspace';

type PendingDiff = {
  originalContent: string;
  modifiedContent: string;
  changeSetId?: string;
};

type PendingDeletion = { originalContent: string; changeSetId?: string };

type Store<T> = ((updater: (draft: T) => void) => void) & T;

type EditorDraft = {
  fileContents?: Record<string, string>;
  pendingDiffs?: Record<string, PendingDiff>;
  pendingDeletions?: Record<string, PendingDeletion>;
};

type FileSystem = {
  rootHandle?: FileSystemDirectoryHandle | null;
  readFileAtPath?: (path: string) => Promise<string>;
  writeFileAtPath?: (path: string, content: string) => Promise<boolean | undefined>;
  deleteFileAtPath?: (path: string) => Promise<boolean | undefined>;
};

type Params = {
  changeSetId: string;
  editorState: Store<EditorDraft>;
  changeSetState: Store<{ items?: unknown[] }> | null;
  fs?: FileSystem | null;
  sidebarState?: Store<{ folderTree?: unknown[] }> | null;
  tabState?: Store<{ openTabs: Array<{ id: string }>; activeTabId?: string | null }> | null;
};

type Result = { applied: number; rejected: number; conflicted: number };

const hasExternalConflict = async (
  fs: FileSystem | null | undefined,
  path: string,
  expected: string,
) => {
  if (!fs?.rootHandle || !fs.readFileAtPath) return false;
  try {
    return (await fs.readFileAtPath(path)) !== expected;
  } catch {
    return expected !== '';
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
  const { diffs, deletions } = targetsFor(params.editorState, params.changeSetId);
  const acceptedDiffs: string[] = [];
  const acceptedDeletions: string[] = [];
  let conflicted = 0;

  for (const [path, diff] of diffs) {
    if (await hasExternalConflict(params.fs, path, diff.originalContent)) {
      updateChangeSetFile(params.changeSetState as never, params.changeSetId, path, 'conflicted');
      conflicted++;
      continue;
    }
    if (params.fs?.rootHandle && params.fs.writeFileAtPath) {
      try {
        const written = await params.fs.writeFileAtPath(path, diff.modifiedContent);
        if (written === false) continue;
      } catch (error) {
        console.error('Failed to approve change in filesystem:', path, error);
        continue;
      }
    }
    acceptedDiffs.push(path);
    updateChangeSetFile(params.changeSetState as never, params.changeSetId, path, 'accepted');
  }

  for (const [path, deletion] of deletions) {
    if (await hasExternalConflict(params.fs, path, deletion.originalContent)) {
      updateChangeSetFile(params.changeSetState as never, params.changeSetId, path, 'conflicted');
      conflicted++;
      continue;
    }
    if (params.fs?.rootHandle && params.fs.deleteFileAtPath) {
      try {
        const deleted = await params.fs.deleteFileAtPath(path);
        if (deleted === false) continue;
      } catch (error) {
        console.error('Failed to approve deletion in filesystem:', path, error);
        continue;
      }
    }
    acceptedDeletions.push(path);
    updateChangeSetFile(params.changeSetState as never, params.changeSetId, path, 'accepted');
  }

  if (acceptedDiffs.length || acceptedDeletions.length) {
    let contents: Record<string, string> = {};
    let pendingDiffs: Record<string, PendingDiff> = {};
    let pendingDeletions: Record<string, PendingDeletion> = {};
    params.editorState((draft) => {
      const nextDiffs = { ...(draft.pendingDiffs || {}) };
      const nextDeletions = { ...(draft.pendingDeletions || {}) };
      const nextContents = { ...(draft.fileContents || {}) };
      for (const path of acceptedDiffs) delete nextDiffs[path];
      for (const path of acceptedDeletions) {
        delete nextDeletions[path];
        delete nextContents[path];
      }
      draft.pendingDiffs = nextDiffs;
      draft.pendingDeletions = nextDeletions;
      draft.fileContents = nextContents;
      contents = nextContents;
      pendingDiffs = nextDiffs;
      pendingDeletions = nextDeletions;
    });
    void Settings.setFileContents?.(contents);
    void Settings.setPendingDiffs?.(pendingDiffs as never);
    void Settings.setPendingDeletions?.(pendingDeletions);
  }
  if (acceptedDeletions.length) {
    params.tabState?.((draft) => {
      draft.openTabs = draft.openTabs.filter((tab) => !acceptedDeletions.includes(tab.id));
      if (draft.activeTabId && acceptedDeletions.includes(draft.activeTabId)) {
        draft.activeTabId = draft.openTabs.at(-1)?.id || null;
      }
    });
    params.sidebarState?.((draft) => {
      for (const path of acceptedDeletions) {
        if (draft.folderTree) {
          draft.folderTree = removeNodeAtPath(
            draft.folderTree as Parameters<typeof removeNodeAtPath>[0],
            path.split('/').filter(Boolean),
          );
        }
      }
    });
  }
  return { applied: acceptedDiffs.length + acceptedDeletions.length, rejected: 0, conflicted };
}

export async function undoAllChangeSetChanges(params: Params): Promise<Result> {
  const { diffs, deletions } = targetsFor(params.editorState, params.changeSetId);
  const revertedDiffs: string[] = [];
  for (const [path, diff] of diffs) {
    if (params.fs?.rootHandle && params.fs.writeFileAtPath) {
      try {
        const written = await params.fs.writeFileAtPath(path, diff.originalContent);
        if (written === false) continue;
      } catch (error) {
        console.error('Failed to undo change in filesystem:', path, error);
        continue;
      }
    }
    revertedDiffs.push(path);
    updateChangeSetFile(params.changeSetState as never, params.changeSetId, path, 'rejected');
  }
  for (const [path] of deletions) {
    updateChangeSetFile(params.changeSetState as never, params.changeSetId, path, 'rejected');
  }
  let contents: Record<string, string> = {};
  let pendingDiffs: Record<string, PendingDiff> = {};
  let pendingDeletions: Record<string, PendingDeletion> = {};
  params.editorState((draft) => {
    const nextDiffs = { ...(draft.pendingDiffs || {}) };
    const nextDeletions = { ...(draft.pendingDeletions || {}) };
    const nextContents = { ...(draft.fileContents || {}) };
    for (const [path, diff] of diffs) {
      if (!revertedDiffs.includes(path)) continue;
      nextContents[path] = diff.originalContent;
      delete nextDiffs[path];
    }
    for (const [path] of deletions) delete nextDeletions[path];
    draft.fileContents = nextContents;
    draft.pendingDiffs = nextDiffs;
    draft.pendingDeletions = nextDeletions;
    contents = nextContents;
    pendingDiffs = nextDiffs;
    pendingDeletions = nextDeletions;
  });
  void Settings.setFileContents?.(contents);
  void Settings.setPendingDiffs?.(pendingDiffs as never);
  void Settings.setPendingDeletions?.(pendingDeletions);
  return {
    applied: 0,
    rejected: revertedDiffs.length + deletions.length,
    conflicted: 0,
  };
}
