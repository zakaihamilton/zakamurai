import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { removeNodeAtPath } from '@/components/App/Panes/Sidebar/TreeUtils';
import { TabState } from '@/components/App/Panes/TabBar';
import { removeLastCodeTabPathInDraft } from '@/components/App/Panes/TabBar/TabStateUtils';
import Settings from '@/components/Storage/Settings';
import { ChangeSetState, updateChangeSetFile } from '@/components/Workspace';
import type { CursorPosition } from '@/types/domain-types';
import { removeEditorPathStateInDraft } from './EditorBuffers';
import { deleteInDraft, setInDraft } from '@/utils/StateUtils';
import { useCallback, useEffect, useRef } from 'react';
import type { DiffActions, DiffHandlerProps, PendingDeletionEntry } from './types';

const isPendingDeletionEntry = (
  value: PendingDeletionEntry | boolean | undefined,
): value is PendingDeletionEntry =>
  typeof value === 'object' && value !== null && 'originalContent' in value;

export default function DiffHandler({
  filePath,
  localContent,
  setLocalContent,
  state,
  fs,
  onStateChange,
}: DiffHandlerProps) {
  const lastPublishedActions = useRef<DiffActions | null>(null);
  const appState = AppState.usePassiveState();
  const workspaceEpoch = appState?.workspaceEpoch || 0;
  const sidebarState = SidebarState.usePassiveState();
  const tabState = TabState.usePassiveState();
  const changeSetState = ChangeSetState.usePassiveState();
  const isCurrentWorkspace = useCallback(
    () => (appState?.workspaceEpoch || 0) === workspaceEpoch,
    [appState, workspaceEpoch],
  );

  const isSamePendingDiff = useCallback(
    (expected: NonNullable<typeof state.pendingDiffs>[string]) => {
      const current = state.pendingDiffs?.[filePath];
      return Boolean(
        current &&
          current.changeSetId === expected.changeSetId &&
          current.originalContent === expected.originalContent &&
          current.modifiedContent === expected.modifiedContent &&
          current.isNewFile === expected.isNewFile,
      );
    },
    [filePath, state],
  );
  const isSamePendingDeletion = useCallback(
    (expected: PendingDeletionEntry) => {
      const current = state.pendingDeletions?.[filePath];
      return Boolean(
        isPendingDeletionEntry(current) &&
          current.changeSetId === expected.changeSetId &&
          current.originalContent === expected.originalContent,
      );
    },
    [filePath, state],
  );
  const hasUnexpectedFile = useCallback(async () => {
    if (!fs?.rootHandle) return false;
    if (!fs.getFileHandleAtPath) return true;
    return Boolean(await fs.getFileHandleAtPath(filePath, fs.rootHandle));
  }, [filePath, fs]);

  const hasExternalConflict = useCallback(
    async (expected: string) => {
      if (!fs?.rootHandle || !fs?.readFileAtPath) return false;
      try {
        return (await fs.readFileAtPath(filePath, fs.rootHandle)) !== expected;
      } catch (_error) {
        // Missing files and permission failures cannot be safely distinguished here.
        return true;
      }
    },
    [filePath, fs],
  );

  const handleApprove = useCallback(async () => {
    if (!isCurrentWorkspace()) return;
    const pendingDeletion = state.pendingDeletions?.[filePath];
    if (isPendingDeletionEntry(pendingDeletion)) {
      const rootHandle = fs?.rootHandle;
      const conflict = await hasExternalConflict(pendingDeletion.originalContent);
      if (!isCurrentWorkspace() || !isSamePendingDeletion(pendingDeletion)) return;
      if (conflict) {
        updateChangeSetFile(changeSetState, pendingDeletion.changeSetId, filePath, 'conflicted');
        console.warn('Refusing to delete externally modified file:', filePath);
        return;
      }
      try {
        if (rootHandle && fs?.deleteFileAtPath) {
          const deleted = await fs.deleteFileAtPath(filePath, rootHandle);
          if (!isCurrentWorkspace()) return;
          if (deleted === false) return;
        }
      } catch (err) {
        if (!isCurrentWorkspace()) return;
        console.error('Failed to delete from FS on approve:', err);
        return;
      }
      if (!isCurrentWorkspace()) return;
      if (!isSamePendingDeletion(pendingDeletion)) {
        const currentDiff = state.pendingDiffs?.[filePath];
        if (currentDiff) {
          updateChangeSetFile(
            changeSetState,
            currentDiff.changeSetId ?? '',
            filePath,
            'conflicted',
          );
        }
        return;
      }
      let remainingContents = {};
      let remainingDiffs = {};
      let remainingDeletions = {};
      state((draft) => {
        removeEditorPathStateInDraft(draft, filePath);
        remainingContents = draft.fileContents || {};
        remainingDiffs = draft.pendingDiffs || {};
        remainingDeletions = draft.pendingDeletions || {};
      });
      void Settings.setFileContents?.(remainingContents);
      void Settings.setPendingDiffs?.(remainingDiffs);
      void Settings.setPendingDeletions?.(remainingDeletions);
      tabState?.((draft) => {
        draft.openTabs = draft.openTabs.filter(
          (tab) => tab.id !== filePath && !tab.id.startsWith(`${filePath}/`),
        );
        if (draft.activeTabId === filePath || draft.activeTabId?.startsWith(`${filePath}/`)) {
          draft.activeTabId = draft.openTabs.at(-1)?.id || null;
        }
        removeLastCodeTabPathInDraft(draft, [filePath]);
      });
      if (sidebarState) {
        sidebarState((draft) => {
          if (!draft.folderTree) return;
          draft.folderTree = removeNodeAtPath(
            draft.folderTree,
            filePath.split('/').filter(Boolean),
          );
        });
      }
      updateChangeSetFile(changeSetState, pendingDeletion.changeSetId, filePath, 'accepted');
      return;
    }

    const pendingDiff = state.pendingDiffs?.[filePath];
    if (pendingDiff) {
      const rootHandle = fs?.rootHandle;
      const conflict = pendingDiff.isNewFile
        ? await hasUnexpectedFile()
        : await hasExternalConflict(pendingDiff.originalContent);
      if (!isCurrentWorkspace() || !isSamePendingDiff(pendingDiff)) return;
      if (conflict) {
        updateChangeSetFile(changeSetState, pendingDiff.changeSetId ?? '', filePath, 'conflicted');
        console.warn('Refusing to overwrite externally modified file:', filePath);
        return;
      }
      try {
        if (rootHandle && fs?.writeFileAtPath) {
          const written = await fs.writeFileAtPath(filePath, localContent, rootHandle);
          if (!isCurrentWorkspace()) return;
          if (written === false) return;
          state((draft) => {
            draft.lastSaved = new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
          });
        }
      } catch (err) {
        if (!isCurrentWorkspace()) return;
        console.error('Failed to save to FS on approve:', err);
        return;
      }
      if (!isCurrentWorkspace()) return;
      let removedPendingDiff = false;
      let currentContents = {};
      let remainingDiffs = {};
      state((draft) => {
        const current = draft.pendingDiffs?.[filePath];
        if (
          current &&
          current.changeSetId === pendingDiff.changeSetId &&
          current.originalContent === pendingDiff.originalContent &&
          current.modifiedContent === pendingDiff.modifiedContent &&
          current.isNewFile === pendingDiff.isNewFile
        ) {
          const nextDiffs = { ...draft.pendingDiffs };
          delete nextDiffs[filePath];
          draft.pendingDiffs = nextDiffs;
          removedPendingDiff = true;
        }
        remainingDiffs = draft.pendingDiffs || {};
        currentContents = draft.fileContents || {};
      });
      if (removedPendingDiff) {
        void Settings.setPendingDiffs?.(remainingDiffs);
        void Settings.setFileContents?.(currentContents);
        updateChangeSetFile(changeSetState, pendingDiff.changeSetId ?? '', filePath, 'accepted');
      }
      return;
    }
  }, [
    changeSetState,
    filePath,
    hasExternalConflict,
    hasUnexpectedFile,
    isCurrentWorkspace,
    isSamePendingDeletion,
    isSamePendingDiff,
    localContent,
    state,
    fs,
    sidebarState,
    tabState,
  ]);

  const handleUndo = useCallback(async () => {
    if (!isCurrentWorkspace()) return;
    const pendingDeletion = state.pendingDeletions?.[filePath];
    if (isPendingDeletionEntry(pendingDeletion)) {
      if (!isSamePendingDeletion(pendingDeletion)) return;
      state((draft) => {
        if (draft.pendingDeletions) {
          const next = { ...draft.pendingDeletions };
          delete next[filePath];
          draft.pendingDeletions = next;
        }
      });
      updateChangeSetFile(changeSetState, pendingDeletion.changeSetId, filePath, 'rejected');
      return;
    }

    const diff = state.pendingDiffs?.[filePath];
    if (diff) {
      if (!isSamePendingDiff(diff)) return;
      const prevContent = diff.originalContent;
      const prevCursor = diff.originalCursorPos;

      try {
        const rootHandle = fs?.rootHandle;
        const conflict = rootHandle
          ? diff.isNewFile
            ? await hasUnexpectedFile()
            : await hasExternalConflict(diff.originalContent)
          : false;
        if (conflict) {
          if (!isCurrentWorkspace() || !isSamePendingDiff(diff)) return;
          updateChangeSetFile(changeSetState, diff.changeSetId ?? '', filePath, 'conflicted');
          console.warn('Refusing to restore an externally modified file:', filePath);
          return;
        }
        if (!isCurrentWorkspace() || !isSamePendingDiff(diff)) return;
        if (!diff.isNewFile && rootHandle && fs?.writeFileAtPath) {
          const written = await fs.writeFileAtPath(filePath, prevContent, rootHandle);
          if (!isCurrentWorkspace() || !isSamePendingDiff(diff)) return;
          if (written === false) return;
        }
      } catch (err) {
        if (!isCurrentWorkspace()) return;
        console.error('Failed to undo in FS:', err);
        return;
      }
      if (!isCurrentWorkspace() || !isSamePendingDiff(diff)) return;

      if (diff.isNewFile) {
        let remainingContents = {};
        let remainingDiffs = {};
        let remainingDeletions = {};
        state((draft) => {
          removeEditorPathStateInDraft(draft, filePath);
          remainingContents = draft.fileContents || {};
          remainingDiffs = draft.pendingDiffs || {};
          remainingDeletions = draft.pendingDeletions || {};
        });
        void Settings.setFileContents?.(remainingContents);
        void Settings.setPendingDiffs?.(remainingDiffs);
        void Settings.setPendingDeletions?.(remainingDeletions);
        setLocalContent('');
        tabState?.((draft) => {
          draft.openTabs = draft.openTabs.filter(
            (tab) => tab.id !== filePath && !tab.id.startsWith(`${filePath}/`),
          );
          if (draft.activeTabId === filePath || draft.activeTabId?.startsWith(`${filePath}/`)) {
            draft.activeTabId = draft.openTabs.at(-1)?.id || null;
          }
          removeLastCodeTabPathInDraft(draft, [filePath]);
        });
        sidebarState?.((draft) => {
          if (!draft.folderTree) return;
          draft.folderTree = removeNodeAtPath(
            draft.folderTree,
            filePath.split('/').filter(Boolean),
          );
        });
        updateChangeSetFile(changeSetState, diff.changeSetId ?? '', filePath, 'rejected');
        return;
      }

      state((draft) => {
        draft.fileContents = { ...draft.fileContents, [filePath]: prevContent };
        deleteInDraft(draft, ['dirtyBufferContents'], filePath);
        if (prevCursor) {
          draft.cursorPos = { ...draft.cursorPos, [filePath]: prevCursor };
        }
        if (draft.pendingDiffs) {
          const nextDiffs = { ...draft.pendingDiffs };
          delete nextDiffs[filePath];
          draft.pendingDiffs = nextDiffs;
        }
      });
      setLocalContent(prevContent);
      updateChangeSetFile(changeSetState, diff.changeSetId ?? '', filePath, 'rejected');
    }
  }, [
    changeSetState,
    filePath,
    hasExternalConflict,
    hasUnexpectedFile,
    isCurrentWorkspace,
    isSamePendingDeletion,
    isSamePendingDiff,
    state,
    fs,
    sidebarState,
    setLocalContent,
    tabState,
  ]);

  const toggleLine = useCallback(
    (line: number) => {
      const lineNum = Number(line);
      state((draft) => {
        const current = draft.selectedLines?.[filePath] || [];
        const exists = current.some((l) => Number(l) === lineNum);
        const next = exists ? current.filter((l) => Number(l) !== lineNum) : [...current, lineNum];
        setInDraft(draft, ['selectedLines', filePath], next);
      });
    },
    [filePath, state],
  );

  const handleCursorUpdate = useCallback(
    (pos: CursorPosition) => {
      state((draft) => {
        const current = draft.cursorPos?.[filePath];
        if (
          current &&
          current.line === pos.line &&
          current.col === pos.col &&
          current.index === pos.index
        ) {
          return;
        }

        draft.cursorPos = {
          ...draft.cursorPos,
          [filePath]: pos,
        };
      });
    },
    [filePath, state],
  );

  useEffect(() => {
    const nextActions: DiffActions = {
      handleApprove,
      handleUndo,
      toggleLine,
      handleCursorUpdate,
    };
    const current = lastPublishedActions.current;
    if (
      current?.handleApprove === nextActions.handleApprove &&
      current?.handleUndo === nextActions.handleUndo &&
      current?.toggleLine === nextActions.toggleLine &&
      current?.handleCursorUpdate === nextActions.handleCursorUpdate
    ) {
      return;
    }

    lastPublishedActions.current = nextActions;
    onStateChange(nextActions);
  }, [handleApprove, handleUndo, toggleLine, handleCursorUpdate, onStateChange]);

  return null;
}
