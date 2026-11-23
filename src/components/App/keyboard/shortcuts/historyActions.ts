import { commitDirtyBufferContentsInDraft } from '@/components/App/Views/EditorArea/EditorBuffers';
import type { ShortcutActionContext } from '@/components/App/types';
import type { CursorPosition, HistorySnapshot } from '@/types/domain-types';

const DEFAULT_CURSOR: CursorPosition = { line: 1, col: 1, index: 0 };
const MAX_FUTURE_HISTORY = 100;

function pushHistoryEntry(entries: HistorySnapshot[], entry: HistorySnapshot, maxLength?: number) {
  const next = [...entries, entry];
  if (maxLength && next.length > maxLength) {
    next.shift();
  }
  return next;
}

export function undoShortcutAction({ editorState, tabState }: ShortcutActionContext): void {
  const filePath = tabState.activeTabId;
  if (!filePath) return;

  editorState((draft) => {
    commitDirtyBufferContentsInDraft(draft);
    const history = { ...(draft.history || {}) };
    history[filePath] = history[filePath] ? { ...history[filePath] } : { past: [], future: [] };
    const hist = history[filePath];

    const currentContent = draft.fileContents[filePath];
    const currentCursor = draft.cursorPos?.[filePath] || DEFAULT_CURSOR;

    if (hist.lastSnapshotContent !== undefined && currentContent !== hist.lastSnapshotContent) {
      hist.future = pushHistoryEntry(
        hist.future || [],
        { content: currentContent, cursor: currentCursor },
        MAX_FUTURE_HISTORY,
      );
      draft.fileContents = { ...draft.fileContents, [filePath]: hist.lastSnapshotContent };
      if (hist.lastSnapshotCursor !== undefined) {
        draft.cursorPos = { ...draft.cursorPos, [filePath]: { ...hist.lastSnapshotCursor } };
      }
      draft.history = history;
      return;
    }

    if (!hist.past || hist.past.length === 0) return;

    const past = [...hist.past];
    const prevState = past.pop();
    if (!prevState) return;

    hist.past = past;
    hist.future = pushHistoryEntry(
      hist.future || [],
      { content: currentContent, cursor: currentCursor },
      MAX_FUTURE_HISTORY,
    );

    draft.fileContents = { ...draft.fileContents, [filePath]: prevState.content };
    if (prevState.cursor !== undefined) {
      draft.cursorPos = { ...draft.cursorPos, [filePath]: { ...prevState.cursor } };
    }
    draft.history = history;
  });
}

export function redoShortcutAction({ editorState, tabState }: ShortcutActionContext): void {
  const filePath = tabState.activeTabId;
  if (!filePath) return;

  editorState((draft) => {
    commitDirtyBufferContentsInDraft(draft);
    if (!draft.history || !draft.history[filePath]) return;
    const history = { ...draft.history };
    const hist = { ...history[filePath] };
    if (!hist.future || hist.future.length === 0) return;

    const currentContent = draft.fileContents[filePath];
    const currentCursor = draft.cursorPos?.[filePath] || DEFAULT_CURSOR;

    const future = [...hist.future];
    const nextState = future.pop();
    if (!nextState) return;

    hist.future = future;
    hist.past = pushHistoryEntry(hist.past || [], {
      content: currentContent,
      cursor: currentCursor,
    });

    draft.fileContents = { ...draft.fileContents, [filePath]: nextState.content };
    if (nextState.cursor !== undefined) {
      draft.cursorPos = { ...draft.cursorPos, [filePath]: { ...nextState.cursor } };
    }
    history[filePath] = hist;
    draft.history = history;
  });
}
