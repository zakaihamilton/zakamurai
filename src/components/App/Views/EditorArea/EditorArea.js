import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { Icons } from '@/components/Core/Base/Icons';
import Node from '@/components/Core/Base/Node';
import { createState } from '@/components/Core/Base/State';
import React, { useCallback, useRef, useEffect, useMemo } from 'react';
import styles from './EditorArea.module.css';

import { DEFAULT_CONTENTS, SCRATCH_CONTENTS } from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';
import { formatCode } from '@/utils/formatter';
import {
  findClassInCss,
  findClassReferenceInJs,
  getAssociatedFilePath,
  getImportRanges,
  getStyleAtCursor,
  resolveRelativePath,
} from '@/utils/navigation';
import CodeEditor from './CodeEditor';
import useCompletion from './CompletionHandler';
import { getCssBlockFolds, isCssPath } from './CssFolding';
import DiffHandler from './DiffHandler';
import EditorHeader from './EditorHeader';
import FindHandler from './FindHandler';
import { getFoldStarts, getVisibleFoldedContent } from './Folding';
import Gutter from './Gutter';
import HistoryHandler from './HistoryHandler';
import { getJavaScriptBlockFolds, isJavaScriptPath } from './JavaScriptFolding';
import { getJsonObjectFolds, isJsonPath } from './JsonFolding';
import SyncHandler from './SyncHandler';
import { highlightCode } from './highlighter';

export const EditorState = createState('EditorState');
const EditorAreaUiState = createState('EditorAreaUiState');

const countLines = (value) => {
  if (!value) return 1;
  let count = 1;
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) === 10) count++;
  }
  return count;
};

const getTemplateContents = () =>
  Settings.getTemplate() === 'scratch' ? SCRATCH_CONTENTS : DEFAULT_CONTENTS;

export default function EditorArea({ file, fsHandle }) {
  return (
    <Node id={file?.path?.join('/') || file?.name || 'EditorArea'}>
      <EditorAreaInner file={file} fsHandle={fsHandle} />
    </Node>
  );
}

function EditorAreaInner({ file, fsHandle }) {
  const appState = AppState.useState();
  const tabState = TabState.useState();
  const { fs } = appState;
  const state = EditorState.useState();
  const filePath = file?.path?.join('/') || file?.name;
  const fallbackContent = getTemplateContents()[filePath] ?? file?.content ?? '';

  const editorAreaUiState = EditorAreaUiState.useState(null, {
    localContent: state.fileContents?.[filePath] ?? fallbackContent,
    showFind: false,
    findQuery: '',
    replaceQuery: '',
    matchIndex: -1,
    matches: [],
    showSideBySide: false,
    diffActions: {},
    collapsedFolds: {},
  });
  const {
    localContent = state.fileContents?.[filePath] ?? fallbackContent,
    showFind = false,
    findQuery = '',
    replaceQuery = '',
    matchIndex = -1,
    matches = [],
    showSideBySide = false,
    diffActions = {},
    collapsedFolds = {},
  } = editorAreaUiState || {};

  const isReadOnly = state.isReadOnly ?? Settings.getEditorReadOnly(false);

  const setEditorAreaValue = useCallback(
    (key, nextValue) => {
      editorAreaUiState((draft) => {
        draft[key] = typeof nextValue === 'function' ? nextValue(draft[key]) : nextValue;
      });
    },
    [editorAreaUiState],
  );
  const setLocalContent = useCallback(
    (nextValue) => setEditorAreaValue('localContent', nextValue),
    [setEditorAreaValue],
  );
  const setShowFind = useCallback(
    (nextValue) => setEditorAreaValue('showFind', nextValue),
    [setEditorAreaValue],
  );
  const setFindQuery = useCallback(
    (nextValue) => setEditorAreaValue('findQuery', nextValue),
    [setEditorAreaValue],
  );
  const setReplaceQuery = useCallback(
    (nextValue) => setEditorAreaValue('replaceQuery', nextValue),
    [setEditorAreaValue],
  );
  const setMatchIndex = useCallback(
    (nextValue) => setEditorAreaValue('matchIndex', nextValue),
    [setEditorAreaValue],
  );
  const setMatches = useCallback(
    (nextValue) => setEditorAreaValue('matches', nextValue),
    [setEditorAreaValue],
  );
  const setShowSideBySide = useCallback(
    (nextValue) => setEditorAreaValue('showSideBySide', nextValue),
    [setEditorAreaValue],
  );
  const setDiffActions = useCallback(
    (nextValue) => setEditorAreaValue('diffActions', nextValue),
    [setEditorAreaValue],
  );
  const setCollapsedFolds = useCallback(
    (nextValue) => setEditorAreaValue('collapsedFolds', nextValue),
    [setEditorAreaValue],
  );
  const setIsReadOnly = useCallback(
    (nextValue) => {
      state((draft) => {
        const current = draft.isReadOnly ?? Settings.getEditorReadOnly(false);
        const resolvedValue = typeof nextValue === 'function' ? nextValue(current) : nextValue;
        draft.isReadOnly = resolvedValue;
        Settings.setEditorReadOnly(resolvedValue);
      });
    },
    [state],
  );
  const localContentRef = useRef(localContent);
  const loadedLocalFileRef = useRef(null);

  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);
  // Sync localContent when state.fileContents changes externally (e.g. from AI)
  useEffect(() => {
    const externalContent = state.fileContents?.[filePath] ?? fallbackContent;
    if (externalContent !== localContent) {
      setLocalContent(externalContent);
    }
  }, [state.fileContents?.[filePath], filePath, fallbackContent, localContent, setLocalContent]);

  useEffect(() => {
    if ((fs.mode !== 'local' && fs.mode !== 'opfs') || !filePath || !fs.readFile) return;
    if (loadedLocalFileRef.current === filePath) return;

    let cancelled = false;
    const startingContent = localContentRef.current;
    const loadContent = async () => {
      const handle = fsHandle || (await fs.getFileHandleAtPath?.(filePath));
      if (!handle || cancelled) return;

      const content = await fs.readFile(handle);
      if (cancelled) return;

      loadedLocalFileRef.current = filePath;
      setLocalContent((current) => (current === startingContent ? content : current));
      state((draft) => {
        if (localContentRef.current === startingContent) {
          draft.fileContents = { ...draft.fileContents, [filePath]: content };
        }
      });
    };

    loadContent().catch((err) => {
      console.error(`Failed to load editor content for ${filePath}`, err);
    });

    return () => {
      cancelled = true;
    };
  }, [filePath, fs, fsHandle, state, setLocalContent]);

  // Background load referenced and sibling files to resolve navigation links
  useEffect(() => {
    if ((fs.mode !== 'local' && fs.mode !== 'opfs') || !filePath || !fs.readFile || !localContent)
      return;

    const isCss = filePath.endsWith('.css');
    const importRanges = getImportRanges(localContent, isCss);

    const loadReferencedFiles = async () => {
      // 1. Load imported files
      for (const range of importRanges) {
        let resolved = range.path;
        if (range.path.startsWith('@/')) {
          resolved = range.path.replace(/^@\//, 'src/');
        } else if (range.path.startsWith('.')) {
          resolved = resolveRelativePath(filePath, range.path);
        }

        const candidates = [
          resolved,
          `${resolved}.js`,
          `${resolved}.jsx`,
          `${resolved}.ts`,
          `${resolved}.tsx`,
          `${resolved}.css`,
          `${resolved}.json`,
          `${resolved}.svg`,
          `${resolved}.png`,
          `${resolved}.jpg`,
          `${resolved}.jpeg`,
          `${resolved}/index.js`,
          `${resolved}/index.jsx`,
          `${resolved}/index.ts`,
          `${resolved}/index.tsx`,
        ];

        for (const candidate of candidates) {
          if (candidate === filePath) continue;
          if (state.fileContents?.[candidate] !== undefined) {
            break;
          }

          try {
            const handle = await fs.getFileHandleAtPath?.(candidate);
            if (handle) {
              const content = await fs.readFile(handle);
              state((draft) => {
                draft.fileContents = {
                  ...draft.fileContents,
                  [candidate]: content,
                };
              });
              break;
            }
          } catch (_e) {
            // Sibling candidate doesn't exist, check next extension
          }
        }
      }

      // 2. Sibling JS/JSX/TS/TSX file discovery for CSS module targets
      if (isCss) {
        const lastSlash = filePath.lastIndexOf('/');
        const dirPath = lastSlash !== -1 ? filePath.substring(0, lastSlash) : '';
        const fileName = lastSlash !== -1 ? filePath.substring(lastSlash + 1) : filePath;
        const baseName = fileName.replace(/\.module\.css$/, '').replace(/\.css$/, '');

        if (dirPath && baseName) {
          const siblingCandidates = [
            `${dirPath}/${baseName}.js`,
            `${dirPath}/${baseName}.jsx`,
            `${dirPath}/${baseName}.ts`,
            `${dirPath}/${baseName}.tsx`,
            `${dirPath}/index.js`,
            `${dirPath}/index.jsx`,
            `${dirPath}/index.ts`,
            `${dirPath}/index.tsx`,
          ];

          for (const candidate of siblingCandidates) {
            if (candidate === filePath) continue;
            if (state.fileContents?.[candidate] !== undefined) continue;

            try {
              const handle = await fs.getFileHandleAtPath?.(candidate);
              if (handle) {
                const content = await fs.readFile(handle);
                state((draft) => {
                  draft.fileContents = {
                    ...draft.fileContents,
                    [candidate]: content,
                  };
                });
              }
            } catch (_e) {
              // Sibling candidate doesn't exist, skip
            }
          }
        }
      }
    };

    loadReferencedFiles().catch((err) => {
      console.error('Error pre-loading referenced files:', err);
    });
  }, [filePath, localContent, fs, state]);

  const leftScrollRef = useRef(null);
  const rightScrollRef = useRef(null);
  const isSyncingScroll = useRef(false);

  const handleScroll = (source, target) => {
    if (!isSyncingScroll.current && source.current && target.current) {
      isSyncingScroll.current = true;
      target.current.scrollTop = source.current.scrollTop;
      target.current.scrollLeft = source.current.scrollLeft;
      requestAnimationFrame(() => {
        isSyncingScroll.current = false;
      });
    }
  };

  const linesCount = useMemo(() => countLines(localContent), [localContent]);
  const folds = useMemo(() => {
    if (isJsonPath(filePath)) return getJsonObjectFolds(localContent, filePath);
    if (isCssPath(filePath)) return getCssBlockFolds(localContent, filePath);
    return getJavaScriptBlockFolds(localContent, filePath);
  }, [localContent, filePath]);
  const foldStarts = useMemo(() => getFoldStarts(folds), [folds]);
  const collapsedFoldIds = collapsedFolds[filePath] || [];
  const visibleFoldedContent = useMemo(
    () => getVisibleFoldedContent(localContent, folds, collapsedFoldIds),
    [localContent, folds, collapsedFoldIds],
  );
  const editorContent = visibleFoldedContent.content;
  const editorLineItems = visibleFoldedContent.lineItems;
  const hasCollapsedFolds = visibleFoldedContent.hasCollapsedFolds;
  const foldLabel = isJsonPath(filePath)
    ? 'JSON object'
    : isCssPath(filePath)
      ? 'CSS block'
      : isJavaScriptPath(filePath)
        ? 'code block'
        : 'fold';

  const toggleFold = useCallback(
    (foldId) => {
      setCollapsedFolds((current = {}) => {
        const currentIds = current[filePath] || [];
        const nextIds = currentIds.includes(foldId)
          ? currentIds.filter((id) => id !== foldId)
          : [...currentIds, foldId];

        return {
          ...current,
          [filePath]: nextIds,
        };
      });
    },
    [filePath, setCollapsedFolds],
  );

  const handleChange = (e) => {
    const newVal = e.target.value;
    setLocalContent(newVal); // Synchronous update for the typing experience

    // Asynchronous dispatch to your state engine
    state((draft) => {
      draft.fileContents = { ...draft.fileContents, [filePath]: newVal };

      // Clear redo history on manual edit
      if (draft.history?.[filePath]) {
        const history = { ...draft.history };
        const hist = { ...history[filePath], future: [] };
        history[filePath] = hist;
        draft.history = history;
      }

      // Clear pending diffs on manual edit to avoid index drift
      if (draft.pendingDiffs?.[filePath]) {
        const nextDiffs = { ...draft.pendingDiffs };
        delete nextDiffs[filePath];
        draft.pendingDiffs = nextDiffs;
      }
    });
  };

  const scrollContainerRef = useRef(null);
  const shouldScrollRef = useRef(null);

  const hasDiff = !!state.pendingDiffs?.[filePath];
  const diffData = state.pendingDiffs?.[filePath];
  const selectedLines = state.selectedLines?.[filePath] || [];
  const cursorPos = state.cursorPos?.[filePath];
  const aiCompletionEnabled = state.aiCompletionEnabled === true;

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
  }, [associatedPath, filePath, cursorPos?.index, state, tabState]);

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
    [state, tabState],
  );

  const lastScrollTimestampRef = useRef(null);

  useEffect(() => {
    const shouldScrollLocal =
      shouldScrollRef.current && shouldScrollRef.current.filePath === filePath;
    const shouldScrollGlobal =
      state.shouldScrollTo &&
      state.shouldScrollTo.filePath === filePath &&
      state.shouldScrollTo.timestamp !== lastScrollTimestampRef.current;

    if (shouldScrollLocal || shouldScrollGlobal) {
      let line = 1;
      if (shouldScrollLocal) {
        line = shouldScrollRef.current.line;
        shouldScrollRef.current = null;
      } else {
        line = state.shouldScrollTo.line;
        lastScrollTimestampRef.current = state.shouldScrollTo.timestamp;
      }

      const container = scrollContainerRef.current;
      if (container) {
        const timer = setTimeout(() => {
          const lineHeight = 1.6 * 14;
          const top = (line - 1) * lineHeight + 20;
          container.scrollTo({
            top: Math.max(0, top - 100),
            behavior: 'smooth',
          });
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [filePath, state.shouldScrollTo]);

  const { suggestion, cancelSuggestion, loading } = useCompletion({
    localContent,
    cursorPos,
    filePath,
    enabled: !hasDiff && !hasCollapsedFolds && aiCompletionEnabled,
    onDebugUpdate: (debug) => {
      state((draft) => {
        draft.aiCompletionDebug = debug;
      });
    },
  });

  // Sync loading state to global EditorState
  useEffect(() => {
    state((draft) => {
      if (!draft.isCompleting) draft.isCompleting = {};
      draft.isCompleting[filePath] = loading;
    });
  }, [loading, filePath, state]);

  useEffect(() => {
    if (!aiCompletionEnabled) {
      cancelSuggestion();
    }
  }, [aiCompletionEnabled, cancelSuggestion]);

  const handleAcceptSuggestion = (text) => {
    if (!cursorPos) return;
    const { index } = cursorPos;
    const newVal = localContent.substring(0, index) + text + localContent.substring(index);
    const nextIndex = index + text.length;
    const textBeforeCursor = newVal.substring(0, nextIndex);
    const linesBeforeCursor = textBeforeCursor.split('\n');

    handleChange({ target: { value: newVal } });
    cancelSuggestion();
    diffActions.handleCursorUpdate?.({
      line: linesBeforeCursor.length,
      col: linesBeforeCursor[linesBeforeCursor.length - 1].length + 1,
      index: nextIndex,
    });
  };

  const handleFormat = () => {
    const formatted = formatCode(localContent, filePath);
    if (formatted !== localContent) {
      handleChange({ target: { value: formatted } });
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: state is intentionally omitted to prevent re-highlighting on every state change
  const highlightedCode = useMemo(() => {
    return highlightCode(
      showSideBySide && hasDiff ? localContent : editorContent,
      filePath,
      state,
      styles,
      showFind,
      findQuery,
      matchIndex,
      suggestion,
      cursorPos,
      isReadOnly,
    );
  }, [
    editorContent,
    hasDiff,
    localContent,
    showSideBySide,
    filePath,
    state.pendingDiffs?.[filePath],
    state.selectedLines?.[filePath],
    showFind,
    findQuery,
    matchIndex,
    suggestion,
    cursorPos,
    isReadOnly,
    isReadOnly ? state.fileContents : null,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: state is intentionally omitted to prevent re-highlighting on every state change
  const originalHighlightedCode = useMemo(() => {
    if (!showSideBySide || !diffData) return '';
    return highlightCode(
      diffData.originalContent,
      filePath,
      state,
      styles,
      showFind,
      findQuery,
      matchIndex,
      undefined,
      state.cursorPos?.[filePath],
      isReadOnly,
    );
  }, [
    showSideBySide,
    diffData,
    filePath,
    state.pendingDiffs?.[filePath],
    state.selectedLines?.[filePath],
    showFind,
    findQuery,
    matchIndex,
    state.cursorPos?.[filePath],
    isReadOnly,
    isReadOnly ? state.fileContents : null,
  ]);

  return (
    <div className={styles.editorArea}>
      <HistoryHandler filePath={filePath} localContent={localContent} state={state} />
      <EditorHeader
        filePath={filePath}
        showFind={showFind}
        setShowFind={setShowFind}
        hasDiff={hasDiff}
        handleApprove={diffActions.handleApprove}
        handleUndo={diffActions.handleUndo}
        showSideBySide={showSideBySide}
        setShowSideBySide={setShowSideBySide}
        handleFormat={handleFormat}
        associatedPath={associatedPath}
        onNavigateToAssociated={handleNavigateToAssociated}
        isReadOnly={isReadOnly}
        setIsReadOnly={setIsReadOnly}
      />

      <FindHandler
        localContent={localContent}
        scrollContainerRef={scrollContainerRef}
        showFind={showFind}
        setShowFind={setShowFind}
        findQuery={findQuery}
        setFindQuery={setFindQuery}
        replaceQuery={replaceQuery}
        setReplaceQuery={setReplaceQuery}
        matchIndex={matchIndex}
        setMatchIndex={setMatchIndex}
        matches={matches}
        setMatches={setMatches}
        handleChange={handleChange}
      />

      <SyncHandler
        fs={fs}
        filePath={filePath}
        localContent={localContent}
        state={state}
        tabState={tabState}
      />

      <DiffHandler
        filePath={filePath}
        localContent={localContent}
        setLocalContent={setLocalContent}
        state={state}
        fs={fs}
        onStateChange={setDiffActions}
      />

      {showSideBySide && hasDiff ? (
        <div className={styles.sideBySideContainer}>
          <div className={styles.sideBySidePane}>
            <div className={styles.paneHeader}>
              <Icons.History /> Original
            </div>
            <div
              ref={leftScrollRef}
              onScroll={() => handleScroll(leftScrollRef, rightScrollRef)}
              className={`${styles.sideBySideScroll} scrollHide`}
            >
              <Gutter linesCount={countLines(diffData.originalContent)} scrollRef={leftScrollRef} />
              <CodeEditor
                localContent={diffData.originalContent}
                highlightedCode={originalHighlightedCode}
                readOnly={true}
                isReadOnly={isReadOnly}
                cursorPos={state.cursorPos?.[filePath]}
                scrollContainerRef={leftScrollRef}
                filePath={filePath}
                onNavigateToAssociated={handleNavigateToAssociated}
                fileContents={state.fileContents}
                onJumpToTarget={handleJumpToTarget}
              />
            </div>
          </div>
          <div className={styles.sideBySidePane}>
            <div className={styles.paneHeader}>
              <Icons.Check /> Modified
            </div>
            <div
              ref={rightScrollRef}
              onScroll={() => handleScroll(rightScrollRef, leftScrollRef)}
              className={`${styles.sideBySideScroll} scrollHide`}
            >
              <Gutter
                linesCount={linesCount}
                selectedLines={selectedLines}
                toggleLine={diffActions.toggleLine}
                scrollRef={rightScrollRef}
              />
              <CodeEditor
                localContent={localContent}
                handleChange={handleChange}
                highlightedCode={highlightedCode}
                onCursorUpdate={diffActions.handleCursorUpdate}
                cursorPos={state.cursorPos?.[filePath]}
                scrollContainerRef={rightScrollRef}
                filePath={filePath}
                onNavigateToAssociated={handleNavigateToAssociated}
                fileContents={state.fileContents}
                onJumpToTarget={handleJumpToTarget}
                isReadOnly={isReadOnly}
              />
            </div>
          </div>
        </div>
      ) : (
        <div ref={scrollContainerRef} className={`${styles.scrollContainer} scrollHide`}>
          <Gutter
            linesCount={linesCount}
            lineItems={editorLineItems}
            selectedLines={selectedLines}
            toggleLine={diffActions.toggleLine}
            foldStarts={foldStarts}
            collapsedFoldIds={collapsedFoldIds}
            toggleFold={toggleFold}
            foldLabel={foldLabel}
            scrollRef={scrollContainerRef}
          />

          <CodeEditor
            localContent={editorContent}
            handleChange={handleChange}
            highlightedCode={highlightedCode}
            onCursorUpdate={hasCollapsedFolds ? undefined : diffActions.handleCursorUpdate}
            cursorPos={hasCollapsedFolds ? undefined : cursorPos}
            scrollContainerRef={scrollContainerRef}
            suggestion={suggestion}
            onAcceptSuggestion={handleAcceptSuggestion}
            onCancelSuggestion={cancelSuggestion}
            filePath={filePath}
            readOnly={hasCollapsedFolds}
            isReadOnly={isReadOnly}
            onNavigateToAssociated={handleNavigateToAssociated}
            fileContents={state.fileContents}
            onJumpToTarget={handleJumpToTarget}
          />
        </div>
      )}
    </div>
  );
}
