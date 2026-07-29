import type { ShortcutActionContext } from '@/components/App/types';
import type { CursorPosition, NavigationHistoryEntry } from '@/components/state/domain-types';
import type { EditorStateDraft } from '@/components/App/Views/EditorArea/types';
import {
  findClassInCss,
  findClassReferenceInJs,
  getAssociatedFilePath,
  getStyleAtCursor,
} from '@/utils/navigation';

export const toggleCssJsAction = ({
  editorState,
  tabState,
  sidebarState,
}: ShortcutActionContext) => {
  if (!editorState || !tabState || !sidebarState) return;
  const filePath = tabState.activeTabId;
  if (!filePath) {
    sidebarState((draft) => {
      draft.isSidebarOpen = !draft.isSidebarOpen;
    });
    return;
  }

  const isCss = filePath.endsWith('.css');
  const isJs =
    filePath.endsWith('.js') ||
    filePath.endsWith('.jsx') ||
    filePath.endsWith('.ts') ||
    filePath.endsWith('.tsx');

  if (!isCss && !isJs) {
    sidebarState((draft) => {
      draft.isSidebarOpen = !draft.isSidebarOpen;
    });
    return;
  }

  const code = editorState.fileContents?.[filePath] || '';
  const cursorPos = editorState.cursorPos?.[filePath] || { index: 0 };
  const index = cursorPos.index ?? 0;

  const styleResult = getStyleAtCursor(code, index, isCss);
  const className = styleResult
    ? typeof styleResult === 'string'
      ? styleResult
      : styleResult.className
    : null;
  const identifier = styleResult && typeof styleResult === 'object' ? styleResult.identifier : null;

  let targetPath: string | null = null;
  if (isCss) {
    targetPath = getAssociatedFilePath(filePath, editorState.fileContents || {});
  } else {
    targetPath = getAssociatedFilePath(filePath, editorState.fileContents || {}, identifier);
  }

  if (!targetPath) {
    sidebarState((draft) => {
      draft.isSidebarOpen = !draft.isSidebarOpen;
    });
    return;
  }

  const targetContent = editorState.fileContents?.[targetPath] ?? '';
  let targetLoc: CursorPosition = { line: 1, col: 1, index: 0 };

  if (className) {
    if (isCss) {
      targetLoc =
        findClassReferenceInJs(targetContent, className, targetPath, filePath) || targetLoc;
    } else {
      targetLoc = findClassInCss(targetContent, className) || targetLoc;
    }
  }

  const fileName = targetPath.substring(targetPath.lastIndexOf('/') + 1);
  const fileObj = {
    name: fileName,
    path: targetPath.split('/'),
    content: targetContent,
  };
  const newTab = {
    id: targetPath,
    type: 'file' as const,
    label: fileName,
    file: fileObj,
  };

  tabState((draft) => {
    const existingTab = draft.openTabs.find((t) => t.id === targetPath);
    if (!existingTab) {
      draft.openTabs = [...draft.openTabs, newTab];
    }
    draft.activeTabId = targetPath;
  });

  editorState((draft: EditorStateDraft) => {
    draft.cursorPos = { ...(draft.cursorPos || {}), [targetPath]: targetLoc };
    draft.shouldScrollTo = {
      filePath: targetPath,
      line: targetLoc.line,
      timestamp: Date.now(),
    };
  });
};

const toCursorPosition = (loc: NavigationHistoryEntry['loc']): CursorPosition => {
  const cursorLoc = loc as CursorPosition & { column?: number };
  return {
    line: cursorLoc.line,
    col: cursorLoc.col ?? cursorLoc.column ?? 1,
    index: cursorLoc.index,
  };
};

export const navigateToHistoryItem = (
  { editorState, tabState }: ShortcutActionContext,
  nextIndex: number,
) => {
  if (!editorState || !tabState) return;
  const history = editorState.navigationHistory;
  if (!history || !history.stack) return;
  const item = history.stack[nextIndex];
  if (!item) return;

  const targetPath = item.filePath;
  const targetLoc = toCursorPosition(item.loc);
  const targetContent = editorState.fileContents?.[targetPath] ?? '';

  const fileName = targetPath.substring(targetPath.lastIndexOf('/') + 1);
  const fileObj = {
    name: fileName,
    path: targetPath.split('/'),
    content: targetContent,
  };
  const newTab = {
    id: targetPath,
    type: 'file' as const,
    label: fileName,
    file: fileObj,
  };

  tabState((draft) => {
    const existingTab = draft.openTabs.find((t) => t.id === targetPath);
    if (!existingTab) {
      draft.openTabs = [...draft.openTabs, newTab];
    }
    draft.activeTabId = targetPath;
  });

  editorState((draft: EditorStateDraft) => {
    draft.cursorPos = { ...(draft.cursorPos || {}), [targetPath]: targetLoc };
    draft.shouldScrollTo = {
      filePath: targetPath,
      line: targetLoc.line,
      timestamp: Date.now(),
    };
    if (draft.navigationHistory) {
      draft.navigationHistory = {
        ...draft.navigationHistory,
        currentIndex: nextIndex,
      };
    }
  });
};

export const navigateBackAction = (states: ShortcutActionContext) => {
  const { editorState } = states;
  if (!editorState) return;
  const history = editorState.navigationHistory;
  if (!history || history.currentIndex <= 0) return;
  navigateToHistoryItem(states, history.currentIndex - 1);
};

export const navigateForwardAction = (states: ShortcutActionContext) => {
  const { editorState } = states;
  if (!editorState) return;
  const history = editorState.navigationHistory;
  if (!history || history.currentIndex >= history.stack.length - 1) return;
  navigateToHistoryItem(states, history.currentIndex + 1);
};

export const switchTabAction = ({ tabState }: ShortcutActionContext, direction: number) => {
  if (!tabState) return;
  const { openTabs = [], activeTabId } = tabState;
  if (openTabs.length < 2) return;

  const activeIndex = openTabs.findIndex((tab) => tab.id === activeTabId);
  const fallbackIndex = direction > 0 ? 0 : openTabs.length - 1;
  const nextIndex =
    activeIndex === -1
      ? fallbackIndex
      : (activeIndex + direction + openTabs.length) % openTabs.length;

  tabState((draft) => {
    draft.activeTabId = openTabs[nextIndex].id;
  });
};
