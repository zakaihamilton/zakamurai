import { ensureFileInTree } from '@/components/AI/Agent/Applier';
import {
  commitDirtyBufferContentsInDraft,
  removeEditorPathStateInDraft,
} from '@/components/App/Views/EditorArea/EditorBuffers';
import Settings from '@/components/Storage/Settings';
import {
  type ChangeSetFileSystem,
  type StoreUpdater,
  removePathsFromTabsAndSidebar,
} from '@/components/Workspace/changeSetFileOps';
import type { TabStateShape } from '@/types/domain-types';
import type { EditorDraft } from './approveAndUndo';

export async function rewindToChangeSetCheckpoint({
  changeSetId,
  editorState,
  changeSetState,
  fs,
  sidebarState,
  tabState,
  isWorkspaceCurrent,
}: {
  changeSetId: string;
  editorState: StoreUpdater<EditorDraft>;
  changeSetState: StoreUpdater<{
    activeId?: string | null;
    items?: Array<{
      id: string;
      files: Array<{
        path: string;
        originalContent?: string;
        proposedContent?: string;
        deleted?: boolean;
        isNewFile?: boolean;
      }>;
    }>;
  }> | null;
  fs?: ChangeSetFileSystem | null;
  sidebarState?: StoreUpdater<{ folderTree?: unknown[] }> | null;
  tabState?: StoreUpdater<TabStateShape> | null;
  isWorkspaceCurrent?: () => boolean;
}): Promise<{ restoredFiles: number; failedPath?: string }> {
  const isCurrent = () => isWorkspaceCurrent?.() ?? true;
  if (!isCurrent()) return { restoredFiles: 0 };

  const items = changeSetState?.items || [];
  const targetIndex = items.findIndex((item) => item.id === changeSetId);
  if (targetIndex < 0) return { restoredFiles: 0 };

  const setsToRewind = items.slice(targetIndex).reverse();
  const restoreMap = new Map<string, string | undefined>();
  for (const set of setsToRewind) {
    for (const file of set.files) {
      const original = file.originalContent ?? '';
      const wasNewFile =
        file.isNewFile ??
        (!file.deleted &&
          original === '' &&
          !Object.hasOwn(editorState.fileContents || {}, file.path));
      restoreMap.set(file.path, wasNewFile ? undefined : original);
    }
  }

  const removedPaths: string[] = [];
  const restoredPaths: string[] = [];
  if (fs?.rootHandle) {
    for (const [path, content] of restoreMap.entries()) {
      if (!isCurrent()) return { restoredFiles: 0 };
      try {
        if (content === undefined) {
          if (!fs.deleteFileAtPath) return { restoredFiles: 0, failedPath: path };
          const deleted = await fs.deleteFileAtPath(path, fs.rootHandle);
          if (!isCurrent()) return { restoredFiles: 0 };
          if (deleted === false) return { restoredFiles: 0, failedPath: path };
        } else {
          if (!fs.writeFileAtPath) return { restoredFiles: 0, failedPath: path };
          const written = await fs.writeFileAtPath(path, content, fs.rootHandle);
          if (!isCurrent()) return { restoredFiles: 0 };
          if (written === false) return { restoredFiles: 0, failedPath: path };
        }
      } catch {
        return { restoredFiles: 0, failedPath: path };
      }
    }
  }
  if (!isCurrent()) return { restoredFiles: 0 };

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
        restoredPaths.push(path);
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
  removePathsFromTabsAndSidebar({
    paths: removedPaths,
    tabState,
    sidebarState,
    updateActiveTab: false,
  });
  if (sidebarState && restoredPaths.length) {
    for (const path of restoredPaths) {
      ensureFileInTree(sidebarState as never, path);
    }
  }

  changeSetState?.((draft) => {
    const remaining = (draft.items || []).slice(0, targetIndex);
    draft.items = remaining;
    draft.activeId = remaining.at(-1)?.id || null;
  });

  return { restoredFiles: restoreMap.size };
}
