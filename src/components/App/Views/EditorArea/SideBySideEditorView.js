import { Icons } from '@/components/ui/Icons';
import React, { useRef } from 'react';
import CodeEditor from './CodeEditor';
import Gutter from './Gutter';

const countLines = (value) => {
  if (!value) return 1;
  let count = 1;
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) === 10) count++;
  }
  return count;
};

export default function SideBySideEditorView({
  styles,
  diffData,
  isReadOnly,
  navigationLinksEnabled,
  filePath,
  handleNavigateToAssociated,
  fileContents,
  handleJumpToTarget,
  linesCount,
  selectedLines,
  diffActions,
  localContent,
  highlightedCode,
  originalHighlightedCode,
  handleChange,
  cursorPos,
}) {
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

  return (
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
            navigationLinksEnabled={navigationLinksEnabled}
            cursorPos={cursorPos}
            scrollContainerRef={leftScrollRef}
            filePath={filePath}
            onNavigateToAssociated={handleNavigateToAssociated}
            fileContents={fileContents}
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
            cursorPos={cursorPos}
            scrollContainerRef={rightScrollRef}
            filePath={filePath}
            onNavigateToAssociated={handleNavigateToAssociated}
            fileContents={fileContents}
            onJumpToTarget={handleJumpToTarget}
            isReadOnly={isReadOnly}
            navigationLinksEnabled={navigationLinksEnabled}
          />
        </div>
      </div>
    </div>
  );
}
