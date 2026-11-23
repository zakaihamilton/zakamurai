import {
  commitDirtyBufferContentsInDraft,
  readEffectiveFileContent,
  removeEditorPathStateInDraft,
} from '@/components/App/Views/EditorArea/EditorBuffers';
import { runWithFileOperation } from '@/components/App/Views/EditorArea/FileOperations';
import type { ShortcutActionContext } from '@/components/App/types';
import { updateChangeSetFile } from '@/components/Workspace';
import {
  hasExternalConflict,
  hasUnexpectedFile,
  isSamePendingDeletion,
  isSamePendingDiff,
  removePathsFromTabsAndSidebar,
} from '@/components/Workspace/changeSetFileOps';

export function approveSaveShortcutAction({
  appState,
  tabState,
  editorState,
  fs,
  sidebarState,
  changeSetState,
  showNotification,
}: ShortcutActionContext): void {
  const activeTabId = tabState.activeTabId;
  if (!activeTabId) return;
  const workspaceEpoch = appState.workspaceEpoch || 0;
  const rootHandle = fs?.rootHandle;
  const isCurrentWorkspace = () => (appState.workspaceEpoch || 0) === workspaceEpoch;
  const hasDeletion = editorState.pendingDeletions?.[activeTabId];
  const hasDiff = editorState.pendingDiffs?.[activeTabId];

  if (hasDeletion) {
    const samePendingDeletion = () =>
      isSamePendingDeletion(editorState.pendingDeletions?.[activeTabId], hasDeletion);

    void runWithFileOperation(editorState, activeTabId, async () => {
      if (!isCurrentWorkspace() || !samePendingDeletion()) return;
      if (typeof hasDeletion === 'object' && hasDeletion !== null) {
        const conflict = await hasExternalConflict(
          fs,
          activeTabId,
          hasDeletion.originalContent,
          rootHandle,
        );
        if (!isCurrentWorkspace() || !samePendingDeletion()) return;
        if (conflict) {
          updateChangeSetFile(
            changeSetState,
            hasDeletion.changeSetId || '',
            activeTabId,
            'conflicted',
          );
          showNotification?.(
            'The file changed outside the editor; deletion was not approved.',
            'error',
          );
          return;
        }
      }
      if (rootHandle && fs?.deleteFileAtPath) {
        const deleted = await fs.deleteFileAtPath(activeTabId, rootHandle);
        if (!isCurrentWorkspace()) return;
        if (!deleted) {
          showNotification?.('Could not delete the file from the mounted project', 'error');
          return;
        }
      }
      if (!isCurrentWorkspace()) return;
      let removed = false;
      editorState((draft) => {
        if (!samePendingDeletion()) return;
        removeEditorPathStateInDraft(draft, activeTabId);
        removed = true;
      });
      if (!removed) return;
      removePathsFromTabsAndSidebar({
        paths: [activeTabId],
        tabState,
        sidebarState,
      });
      if (typeof hasDeletion === 'object' && hasDeletion !== null) {
        updateChangeSetFile(changeSetState, hasDeletion.changeSetId || '', activeTabId, 'accepted');
      }
      showNotification?.('Deletion approved', 'success');
    }).catch((error) => {
      if (!isCurrentWorkspace()) return;
      showNotification?.(
        `Could not delete the file: ${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
    });
    return;
  }

  if (hasDiff) {
    const content = readEffectiveFileContent(editorState, activeTabId);
    const samePendingDiff = () =>
      isSamePendingDiff(editorState.pendingDiffs?.[activeTabId], hasDiff);

    void runWithFileOperation(editorState, activeTabId, async () => {
      if (!isCurrentWorkspace() || !samePendingDiff()) return;
      const conflict = hasDiff.isNewFile
        ? await hasUnexpectedFile(fs, activeTabId, rootHandle, { catchErrors: false })
        : await hasExternalConflict(fs, activeTabId, hasDiff.originalContent, rootHandle);
      if (!isCurrentWorkspace() || !samePendingDiff()) return;
      if (conflict) {
        updateChangeSetFile(changeSetState, hasDiff.changeSetId || '', activeTabId, 'conflicted');
        showNotification?.(
          'The file changed outside the editor; changes were not approved.',
          'error',
        );
        return;
      }
      if (rootHandle && fs?.writeFileAtPath && content !== undefined) {
        const written = await fs.writeFileAtPath(activeTabId, content, rootHandle);
        if (!isCurrentWorkspace() || !samePendingDiff()) return;
        if (!written) {
          showNotification?.('Could not save the file to the mounted project', 'error');
          return;
        }
      }
      if (!isCurrentWorkspace() || !samePendingDiff()) return;
      let removed = false;
      editorState((draft) => {
        if (isSamePendingDiff(draft.pendingDiffs?.[activeTabId], hasDiff)) {
          const nextDiffs = { ...draft.pendingDiffs };
          delete nextDiffs[activeTabId];
          draft.pendingDiffs = nextDiffs;
          removed = true;
        }
      });
      if (!removed) return;
      updateChangeSetFile(changeSetState, hasDiff.changeSetId || '', activeTabId, 'accepted');
      showNotification?.('Changes approved & saved', 'success');
    }).catch((error) => {
      if (!isCurrentWorkspace()) return;
      showNotification?.(
        `Could not save the file: ${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
    });
    return;
  }

  showNotification?.('Project saved', 'success');
}

export function cancelChangesShortcutAction({
  appState,
  tabState,
  editorState,
  fs,
  changeSetState,
  sidebarState,
  showNotification,
}: ShortcutActionContext): void {
  const activeTabId = tabState.activeTabId;
  if (!activeTabId) return;
  const workspaceEpoch = appState.workspaceEpoch || 0;
  const rootHandle = fs?.rootHandle;
  const isCurrentWorkspace = () => (appState.workspaceEpoch || 0) === workspaceEpoch;
  const pendingDeletion = editorState.pendingDeletions?.[activeTabId];

  if (pendingDeletion) {
    if (editorState.pendingFileOperations?.[activeTabId]) return;
    editorState((draft) => {
      if (draft.pendingDeletions) {
        const next = { ...draft.pendingDeletions };
        delete next[activeTabId];
        draft.pendingDeletions = next;
      }
    });
    if (typeof pendingDeletion === 'object' && pendingDeletion !== null) {
      updateChangeSetFile(
        changeSetState,
        pendingDeletion.changeSetId || '',
        activeTabId,
        'rejected',
      );
    }
    showNotification?.('Deletion cancelled', 'info');
    return;
  }

  const diff = editorState.pendingDiffs?.[activeTabId];
  if (!diff) return;

  const prevContent = diff.originalContent;
  const prevCursor = diff.originalCursorPos;
  const samePendingDiff = () => isSamePendingDiff(editorState.pendingDiffs?.[activeTabId], diff);

  void runWithFileOperation(editorState, activeTabId, async () => {
    if (!isCurrentWorkspace() || !samePendingDiff()) return;
    const conflict = diff.isNewFile
      ? await hasUnexpectedFile(fs, activeTabId, rootHandle, { catchErrors: false })
      : await hasExternalConflict(fs, activeTabId, diff.originalContent, rootHandle);
    if (!isCurrentWorkspace() || !samePendingDiff()) return;
    if (conflict) {
      updateChangeSetFile(changeSetState, diff.changeSetId || '', activeTabId, 'conflicted');
      showNotification?.(
        'The file changed outside the editor; changes were not cancelled.',
        'error',
      );
      return;
    }
    if (!diff.isNewFile && rootHandle && fs?.writeFileAtPath) {
      const written = await fs.writeFileAtPath(activeTabId, prevContent, rootHandle);
      if (!isCurrentWorkspace() || !samePendingDiff()) return;
      if (!written) {
        showNotification?.('Could not restore the file in the mounted project', 'error');
        return;
      }
    }
    if (!isCurrentWorkspace() || !samePendingDiff()) return;
    if (diff.isNewFile) {
      editorState((draft) => {
        removeEditorPathStateInDraft(draft, activeTabId);
      });
      removePathsFromTabsAndSidebar({
        paths: [activeTabId],
        tabState,
        sidebarState,
      });
      updateChangeSetFile(changeSetState, diff.changeSetId || '', activeTabId, 'rejected');
      showNotification?.('New file cancelled', 'info');
      return;
    }
    editorState((draft) => {
      commitDirtyBufferContentsInDraft(draft);
      draft.fileContents = { ...draft.fileContents, [activeTabId]: prevContent };
      if (prevCursor) {
        draft.cursorPos = { ...draft.cursorPos, [activeTabId]: prevCursor };
      }
      if (draft.pendingDiffs) {
        const nextDiffs = { ...draft.pendingDiffs };
        delete nextDiffs[activeTabId];
        draft.pendingDiffs = nextDiffs;
      }
    });
    updateChangeSetFile(changeSetState, diff.changeSetId || '', activeTabId, 'rejected');
    showNotification?.('Changes cancelled', 'info');
  }).catch((error) => {
    if (!isCurrentWorkspace()) return;
    showNotification?.(
      `Could not restore the file: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
  });
}
