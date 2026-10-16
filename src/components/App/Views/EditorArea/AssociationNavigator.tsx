import type { CursorPosition } from '@/types/domain-types';
import {
  findClassInCss,
  findClassReferenceInJs,
  getAssociatedFilePath,
  getStyleAtCursor,
} from '@/utils/navigation';
import type { SourceLocation } from '@/utils/navigation/types';
import { useCallback, useMemo } from 'react';
import {
  createEffectiveFileContentsLookup,
  createEffectiveFileContentsSnapshot,
} from './EditorBuffers';
import type {
  AssociationNavigatorProps,
  EditorStateDraft,
  NavigationHistoryEntry,
  NavigationHistoryStack,
} from './types';

const recordJump = (
  draft: EditorStateDraft,
  originPath: string,
  originLoc: CursorPosition | undefined,
  targetPath: string,
  targetLoc: SourceLocation,
) => {
  const history = (draft.navigationHistory || {
    stack: [],
    currentIndex: -1,
  }) as NavigationHistoryStack;
  let stack = [...(history.stack || [])];
  let currentIndex = history.currentIndex;

  const origin: NavigationHistoryEntry = {
    filePath: originPath,
    loc: originLoc
      ? { line: originLoc.line, col: originLoc.col ?? 1, index: originLoc.index ?? 0 }
      : { line: 1, col: 1, index: 0 },
    label: originPath.substring(originPath.lastIndexOf('/') + 1),
  };

  const target: NavigationHistoryEntry = {
    filePath: targetPath,
    loc: targetLoc
      ? { line: targetLoc.line, col: targetLoc.col ?? 1, index: targetLoc.index ?? 0 }
      : { line: 1, col: 1, index: 0 },
    label: targetPath.substring(targetPath.lastIndexOf('/') + 1),
  };

  if (currentIndex >= 0 && currentIndex < stack.length - 1) {
    stack = stack.slice(0, currentIndex + 1);
  }

  const lastItem = stack[stack.length - 1];
  const isDifferentFromLast =
    !lastItem ||
    lastItem.filePath !== origin.filePath ||
    Math.abs(lastItem.loc.line - origin.loc.line) > 1;

  if (isDifferentFromLast) {
    stack.push(origin);
  }

  stack.push(target);

  if (stack.length > 50) {
    stack = stack.slice(stack.length - 50);
  }

  currentIndex = stack.length - 1;

  draft.navigationHistory = {
    stack,
    currentIndex,
  };
};

export default function useAssociationNavigator({
  filePath,
  cursorPos,
  localContentRef,
  state,
  tabState,
  shouldScrollRef,
}: AssociationNavigatorProps) {
  const isCss = filePath.endsWith('.css');
  // CSS-to-JS fallback lookup scans the workspace contents, none of which are
  // affected by edits to the currently open CSS file. Keep that lookup on the
  // committed map; navigation itself resolves against a fresh action snapshot.
  const associationContents = isCss
    ? state.fileContents || {}
    : createEffectiveFileContentsLookup(state);
  const associatedPath = useMemo(
    () => getAssociatedFilePath(filePath, associationContents),
    [associationContents, filePath],
  );

  const handleNavigateToAssociated = useCallback(() => {
    const code = localContentRef.current || '';
    const currentContents = createEffectiveFileContentsSnapshot(state);
    const index = cursorPos?.index ?? 0;
    const isCssFile = filePath.endsWith('.css');

    const styleResult = getStyleAtCursor(code, index, isCssFile);
    const className = styleResult
      ? typeof styleResult === 'string'
        ? styleResult
        : styleResult.className
      : null;
    const identifier =
      styleResult && typeof styleResult === 'object' ? styleResult.identifier : null;

    let targetPath = getAssociatedFilePath(filePath, currentContents);
    if (!isCssFile && identifier) {
      const dynamicPath = getAssociatedFilePath(filePath, currentContents, identifier);
      if (dynamicPath) {
        targetPath = dynamicPath;
      }
    }

    if (!targetPath) return;

    const targetContent = currentContents[targetPath] ?? '';
    let targetLoc: SourceLocation | null = null;

    if (className) {
      if (isCssFile) {
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
      type: 'file' as const,
      label: fileName,
      file: fileObj,
    };

    tabState?.((draft) => {
      const existingTab = draft.openTabs.find((t) => t.id === targetPath);
      if (!existingTab) {
        draft.openTabs = [...draft.openTabs, newTab];
      }
      draft.activeTabId = targetPath;
    });

    state((draft) => {
      draft.cursorPos = { ...(draft.cursorPos || {}), [targetPath]: targetLoc };
      draft.shouldScrollTo = {
        filePath: targetPath,
        line: targetLoc.line,
        timestamp: Date.now(),
      };
      recordJump(draft, filePath, cursorPos, targetPath, targetLoc);
    });

    shouldScrollRef.current = {
      filePath: targetPath,
      line: targetLoc.line,
    };
  }, [filePath, cursorPos, state, tabState, localContentRef, shouldScrollRef]);

  const handleJumpToTarget = useCallback(
    (targetPath: string, targetLoc: SourceLocation) => {
      if (!targetPath || !targetLoc) return;

      const targetContent = createEffectiveFileContentsSnapshot(state)[targetPath] ?? '';
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

      tabState?.((draft) => {
        const existingTab = draft.openTabs.find((t) => t.id === targetPath);
        if (!existingTab) {
          draft.openTabs = [...draft.openTabs, newTab];
        }
        draft.activeTabId = targetPath;
      });

      state((draft) => {
        draft.cursorPos = { ...(draft.cursorPos || {}), [targetPath]: targetLoc };
        draft.shouldScrollTo = {
          filePath: targetPath,
          line: targetLoc.line,
          timestamp: Date.now(),
        };
        recordJump(draft, filePath, cursorPos, targetPath, targetLoc);
      });

      shouldScrollRef.current = {
        filePath: targetPath,
        line: targetLoc.line,
      };
    },
    [state, tabState, shouldScrollRef, filePath, cursorPos],
  );

  return {
    associatedPath,
    handleNavigateToAssociated,
    handleJumpToTarget,
  };
}
