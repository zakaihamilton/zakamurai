import { SidebarState } from '@/components/App/Panes/Sidebar';
import { removeNodeAtPath } from '@/components/App/Panes/Sidebar/TreeUtils';
import { TabState } from '@/components/App/Panes/TabBar';
import { deleteKeysWithPrefixInDraft, setInDraft } from '@/components/state/StateUtils';
import { useCallback, useEffect, useRef } from 'react';

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
}) {
  const lastPublishedActions = useRef(null);
  const sidebarState = SidebarState.usePassiveState();
  const tabState = TabState.usePassiveState();

  const handleApprove = useCallback(async () => {
    const pendingDeletion = state.pendingDeletions?.[filePath];
    if (pendingDeletion) {
      state((draft) => {
        deleteKeysWithPrefixInDraft(draft, EDITOR_PATH_MAPS, filePath);
      });
      tabState((draft) => {
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
      try {
        if (fs?.rootHandle && fs?.deleteFileAtPath) {
          await fs.deleteFileAtPath(filePath);
        }
      } catch (err) {
        console.error('Failed to delete from FS on approve:', err);
      }
      return;
    }

    state((draft) => {
      if (draft.pendingDiffs) {
        const nextDiffs = { ...draft.pendingDiffs };
        delete nextDiffs[filePath];
        draft.pendingDiffs = nextDiffs;
      }
    });

    try {
      if (fs?.rootHandle && fs?.writeFileAtPath) {
        await fs.writeFileAtPath(filePath, localContent);
        state((draft) => {
          draft.lastSaved = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
        });
      }
    } catch (err) {
      console.error('Failed to save to FS on approve:', err);
    }
  }, [filePath, localContent, state, fs, sidebarState, tabState]);

  const handleUndo = useCallback(async () => {
    const pendingDeletion = state.pendingDeletions?.[filePath];
    if (pendingDeletion) {
      state((draft) => {
        if (draft.pendingDeletions) {
          const next = { ...draft.pendingDeletions };
          delete next[filePath];
          draft.pendingDeletions = next;
        }
      });
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

      try {
        if (fs?.rootHandle && fs?.writeFileAtPath) {
          await fs.writeFileAtPath(filePath, prevContent);
        }
      } catch (err) {
        console.error('Failed to undo in FS:', err);
      }
    }
  }, [filePath, state, fs, setLocalContent]);

  const toggleLine = useCallback(
    (line) => {
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
    (pos) => {
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
    const nextActions = {
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
