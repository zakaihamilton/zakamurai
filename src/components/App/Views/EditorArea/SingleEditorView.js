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
  hasCollapsedFolds,
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
        onCursorUpdate={hasCollapsedFolds ? undefined : diffActions.handleCursorUpdate}
        cursorPos={hasCollapsedFolds ? undefined : cursorPos}
        scrollContainerRef={scrollContainerRef}
        suggestion={suggestion}
        onAcceptSuggestion={onAcceptSuggestion}
        onCancelSuggestion={cancelSuggestion}
        filePath={filePath}
        readOnly={hasCollapsedFolds}
        isReadOnly={isReadOnly}
        navigationLinksEnabled={navigationLinksEnabled}
        onNavigateToAssociated={handleNavigateToAssociated}
        fileContents={fileContents}
        onJumpToTarget={handleJumpToTarget}
      />
    </div>
  );
}
