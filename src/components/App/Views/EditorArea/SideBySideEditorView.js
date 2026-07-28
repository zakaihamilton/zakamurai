import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React, { useRef, useState } from 'react';
import CodeEditor from './CodeEditor';
import Gutter from './Gutter';
import styles from './SideBySideEditorView.module.css';

const countLines = (value) => {
  if (!value) return 1;
  let count = 1;
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) === 10) count++;
  }
  return count;
};

export default function SideBySideEditorView({
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
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [copiedModified, setCopiedModified] = useState(false);

  const handleCopyOriginal = () => {
    navigator.clipboard.writeText(diffData.originalContent || '');
    setCopiedOriginal(true);
    setTimeout(() => setCopiedOriginal(false), 2000);
  };

  const handleCopyModified = () => {
    navigator.clipboard.writeText(localContent || '');
    setCopiedModified(true);
    setTimeout(() => setCopiedModified(false), 2000);
  };

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
          <div className={styles.paneHeaderTitle}>
            <Icons.History /> Original
          </div>
          <Tooltip content={copiedOriginal ? 'Copied!' : 'Copy Original'}>
            <button
              type="button"
              onClick={handleCopyOriginal}
              className={styles.copyPaneBtn}
              aria-label="Copy Original"
            >
              <Icons.Copy />
            </button>
          </Tooltip>
        </div>
        <div
          ref={leftScrollRef}
          onScroll={() => handleScroll(leftScrollRef, rightScrollRef)}
          className={styles.sideBySideScroll}
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
          <div className={styles.paneHeaderTitle}>
            <Icons.Check /> Modified
          </div>
          <Tooltip content={copiedModified ? 'Copied!' : 'Copy Modified'}>
            <button
              type="button"
              onClick={handleCopyModified}
              className={styles.copyPaneBtn}
              aria-label="Copy Modified"
            >
              <Icons.Copy />
            </button>
          </Tooltip>
        </div>
        <div
          ref={rightScrollRef}
          onScroll={() => handleScroll(rightScrollRef, leftScrollRef)}
          className={styles.sideBySideScroll}
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
