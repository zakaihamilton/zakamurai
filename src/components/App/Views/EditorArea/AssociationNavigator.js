import {
  findClassInCss,
  findClassReferenceInJs,
  getAssociatedFilePath,
  getStyleAtCursor,
} from '@/utils/navigation';
import { useCallback, useMemo } from 'react';

export default function useAssociationNavigator({
  filePath,
  cursorPos,
  localContentRef,
  state,
  tabState,
  shouldScrollRef,
}) {
  const associatedPath = useMemo(() => {
    return getAssociatedFilePath(filePath, state.fileContents || {});
  }, [filePath, state.fileContents]);

  const handleNavigateToAssociated = useCallback(() => {
    const code = localContentRef.current || '';
    const index = cursorPos?.index ?? 0;
    const isCss = filePath.endsWith('.css');

    const styleResult = getStyleAtCursor(code, index, isCss);
    const className = styleResult
      ? typeof styleResult === 'string'
        ? styleResult
        : styleResult.className
      : null;
    const identifier =
      styleResult && typeof styleResult === 'object' ? styleResult.identifier : null;

    // Dynamically resolve target path for multi-CSS file support
    let targetPath = associatedPath;
    if (!isCss && identifier) {
      const dynamicPath = getAssociatedFilePath(filePath, state.fileContents || {}, identifier);
      if (dynamicPath) {
        targetPath = dynamicPath;
      }
    }

    if (!targetPath) return;

    const targetContent = state.fileContents?.[targetPath] ?? '';
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

    state((draft) => {
      if (!draft.cursorPos) {
        draft.cursorPos = {};
      }
      draft.cursorPos[targetPath] = targetLoc;
    });

    shouldScrollRef.current = {
      filePath: targetPath,
      line: targetLoc.line,
    };
  }, [
    associatedPath,
    filePath,
    cursorPos?.index,
    state,
    tabState,
    localContentRef,
    shouldScrollRef,
  ]);

  const handleJumpToTarget = useCallback(
    (targetPath, targetLoc) => {
      if (!targetPath || !targetLoc) return;

      const targetContent = state.fileContents?.[targetPath] ?? '';
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

      state((draft) => {
        if (!draft.cursorPos) {
          draft.cursorPos = {};
        }
        draft.cursorPos[targetPath] = targetLoc;
      });

      shouldScrollRef.current = {
        filePath: targetPath,
        line: targetLoc.line,
      };
    },
    [state, tabState, shouldScrollRef],
  );

  return {
    associatedPath,
    handleNavigateToAssociated,
    handleJumpToTarget,
  };
}
