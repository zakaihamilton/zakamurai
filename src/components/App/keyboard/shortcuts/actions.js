import {
  findClassInCss,
  findClassReferenceInJs,
  getAssociatedFilePath,
  getStyleAtCursor,
} from '@/utils/navigation';

export const toggleCssJsAction = ({ editorState, tabState, sidebarState }) => {
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

  let targetPath = null;
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
  let targetLoc = null;

  if (className) {
    if (isCss) {
      targetLoc = findClassReferenceInJs(targetContent, className, targetPath, filePath);
    } else {
      targetLoc = findClassInCss(targetContent, className);
    }
  }

  if (!targetLoc) {
    targetLoc = { line: 1, col: 1, index: 0 };
  }

  const fileName = targetPath.substring(targetPath.lastIndexOf('/') + 1);
  const fileObj = {
    name: fileName,
    path: targetPath.split('/'),
    content: targetContent,
  };
  const newTab = {
    id: targetPath,
    type: 'file',
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

  editorState((draft) => {
    draft.cursorPos = { ...(draft.cursorPos || {}), [targetPath]: targetLoc };
    draft.shouldScrollTo = {
      filePath: targetPath,
      line: targetLoc.line,
      timestamp: Date.now(),
    };
  });
};

export const navigateToHistoryItem = ({ editorState, tabState }, nextIndex) => {
  const history = editorState.navigationHistory;
  if (!history || !history.stack) return;
  const item = history.stack[nextIndex];
  if (!item) return;

  const targetPath = item.filePath;
  const targetLoc = item.loc;
  const targetContent = editorState.fileContents?.[targetPath] ?? '';

  const fileName = targetPath.substring(targetPath.lastIndexOf('/') + 1);
  const fileObj = {
    name: fileName,
    path: targetPath.split('/'),
    content: targetContent,
  };
  const newTab = {
    id: targetPath,
    type: 'file',
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

  editorState((draft) => {
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

export const navigateBackAction = (states) => {
  const { editorState } = states;
  const history = editorState.navigationHistory;
  if (!history || history.currentIndex <= 0) return;
  navigateToHistoryItem(states, history.currentIndex - 1);
};

export const navigateForwardAction = (states) => {
  const { editorState } = states;
  const history = editorState.navigationHistory;
  if (!history || history.currentIndex >= history.stack.length - 1) return;
  navigateToHistoryItem(states, history.currentIndex + 1);
};

export const switchTabAction = ({ tabState }, direction) => {
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
