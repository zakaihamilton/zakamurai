import { SidebarState } from '@/components/App/Panes/Sidebar';
import { removeNodeAtPath } from '@/components/App/Panes/Sidebar/TreeUtils';
import { TabState } from '@/components/App/Panes/TabBar';
import { ChangeSetState, updateChangeSetFile } from '@/components/Workspace';
import { deleteKeysWithPrefixInDraft, setInDraft } from '@/components/state/StateUtils';
import type { CursorPosition } from '@/components/state/domain-types';
import { useCallback, useEffect, useRef } from 'react';
import type { DiffActions, DiffHandlerProps, PendingDeletionEntry } from './types';

const isPendingDeletionEntry = (
  value: PendingDeletionEntry | boolean | undefined,
): value is PendingDeletionEntry =>
  typeof value === 'object' && value !== null && 'originalContent' in value;

const EDITOR_PATH_MAPS = [
  'fileContents',
  'pendingDiffs',
  'pendingDeletions',
  'history',
  'cursorPos',
  'selectedLines',
];

export default function DiffHandler({
  filePath,
  localContent,
  setLocalContent,
  state,
  fs,
  onStateChange,
}: DiffHandlerProps) {
  const lastPublishedActions = useRef<DiffActions | null>(null);
  const sidebarState = SidebarState.usePassiveState();
  const tabState = TabState.usePassiveState();
  const changeSetState = ChangeSetState.usePassiveState();

  const hasExternalConflict = useCallback(
    async (expected: string) => {
      if (!fs?.rootHandle || !fs?.readFileAtPath) return false;
      try {
        return (await fs.readFileAtPath(filePath)) !== expected;
      } catch (_error) {
        // A missing file is a conflict for edits and expected for a just-created file.
        return expected !== '';
      }
    },
    [filePath, fs],
  );

  const handleApprove = useCallback(async () => {
    const pendingDeletion = state.pendingDeletions?.[filePath];
    if (isPendingDeletionEntry(pendingDeletion)) {
      if (await hasExternalConflict(pendingDeletion.originalContent)) {
        updateChangeSetFile(changeSetState, pendingDeletion.changeSetId, filePath, 'conflicted');
        console.warn('Refusing to delete externally modified file:', filePath);
        return;
      }
      try {
        if (fs?.rootHandle && fs?.deleteFileAtPath) {
          const deleted = await fs.deleteFileAtPath(filePath);
          if (deleted === false) return;
        }
      } catch (err) {
        console.error('Failed to delete from FS on approve:', err);
        return;
      }
      state((draft) => {
        deleteKeysWithPrefixInDraft(draft, EDITOR_PATH_MAPS, filePath);
      });
      tabState?.((draft) => {
        draft.openTabs = draft.openTabs.filter(
          (tab) => tab.id !== filePath && !tab.id.startsWith(`${filePath}/`),
        );
        if (draft.activeTabId === filePath || draft.activeTabId?.startsWith(`${filePath}/`)) {
          draft.activeTabId = draft.openTabs.at(-1)?.id || null;
        }
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
    if (pendingDiff && (await hasExternalConflict(pendingDiff.originalContent))) {
      updateChangeSetFile(changeSetState, pendingDiff.changeSetId ?? '', filePath, 'conflicted');
      console.warn('Refusing to overwrite externally modified file:', filePath);
      return;
    }

    try {
      if (fs?.rootHandle && fs?.writeFileAtPath) {
        const written = await fs.writeFileAtPath(filePath, localContent);
        if (written === false) return;
        state((draft) => {
          draft.lastSaved = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
        });
      }
    } catch (err) {
      console.error('Failed to save to FS on approve:', err);
      return;
    }
    state((draft) => {
      if (draft.pendingDiffs) {
        const nextDiffs = { ...draft.pendingDiffs };
        delete nextDiffs[filePath];
        draft.pendingDiffs = nextDiffs;
      }
    });
    updateChangeSetFile(changeSetState, pendingDiff?.changeSetId ?? '', filePath, 'accepted');
  }, [
    changeSetState,
    filePath,
    hasExternalConflict,
    localContent,
    state,
    fs,
    sidebarState,
    tabState,
  ]);

  const handleUndo = useCallback(async () => {
    const pendingDeletion = state.pendingDeletions?.[filePath];
    if (isPendingDeletionEntry(pendingDeletion)) {
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
      const prevContent = diff.originalContent;
      const prevCursor = diff.originalCursorPos;

      state((draft) => {
        draft.fileContents = { ...draft.fileContents, [filePath]: prevContent };
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

      try {
        if (fs?.rootHandle && fs?.writeFileAtPath) {
          await fs.writeFileAtPath(filePath, prevContent);
        }
      } catch (err) {
        console.error('Failed to undo in FS:', err);
      }
    }
  }, [changeSetState, filePath, state, fs, setLocalContent]);

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
