import React, { useLayoutEffect } from 'react';
import CodeEditor from './CodeEditor';
import Gutter from './Gutter';
import styles from './SingleEditorView.module.css';

export default function SingleEditorView({
  scrollContainerRef,
  linesCount,
  editorLineItems,
  selectedLines,
  diffActions,
  foldStarts,
  collapsedFoldIds,
  toggleFold,
  foldLabel,
  editorContent,
  handleChange,
  highlightedCode,
  onCopySelection,
  cursorPos,
  suggestion,
  onAcceptSuggestion,
  cancelSuggestion,
  isCompleting = false,
  filePath,
  isReadOnly,
  navigationLinksEnabled,
  handleNavigateToAssociated,
  fileContents,
  handleJumpToTarget,
}) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-sync gutter heights when editor content changes
  useLayoutEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return undefined;

    const syncHeights = () => {
      const codeLines = container.querySelectorAll('[data-line]');
      const gutterLines = container.querySelectorAll('[data-gutter-line]');
      codeLines.forEach((codeLine, index) => {
        const gutterLine = gutterLines[index];
        if (gutterLine) {
          const rect = codeLine.getBoundingClientRect();
          gutterLine.style.height = `${rect.height}px`;
        }
      });
    };

    syncHeights();
    const timer = setTimeout(syncHeights, 50);

    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(syncHeights);
      observer.observe(container);
    }

    return () => {
      clearTimeout(timer);
      if (observer) observer.disconnect();
    };
  }, [scrollContainerRef, highlightedCode]);

  return (
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
        onCursorUpdate={diffActions.handleCursorUpdate}
        cursorPos={cursorPos}
        scrollContainerRef={scrollContainerRef}
        suggestion={suggestion}
        onAcceptSuggestion={onAcceptSuggestion}
        onCancelSuggestion={cancelSuggestion}
        isCompleting={isCompleting}
        filePath={filePath}
        readOnly={false}
        isReadOnly={isReadOnly}
        onCopySelection={onCopySelection}
        navigationLinksEnabled={navigationLinksEnabled}
        onNavigateToAssociated={handleNavigateToAssociated}
        fileContents={fileContents}
        onJumpToTarget={handleJumpToTarget}
      />
    </div>
  );
}
