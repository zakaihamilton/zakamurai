import React from 'react';
import CodeEditor from './CodeEditor';
import Gutter from './Gutter';

export default function SingleEditorView({
  styles,
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
  filePath,
  isReadOnly,
  navigationLinksEnabled,
  handleNavigateToAssociated,
  fileContents,
  handleJumpToTarget,
}) {
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
