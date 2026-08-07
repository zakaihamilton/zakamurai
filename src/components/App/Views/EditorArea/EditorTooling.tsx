import DiffHandler from './DiffHandler';
import EditorHeader from './EditorHeader';
import FindHandler from './FindHandler';
import HistoryHandler from './HistoryHandler';
import SyncHandler from './SyncHandler';
import type { EditorToolingProps } from './types';

export default function EditorTooling({
  filePath,
  fileName,
  localContent,
  setLocalContent,
  state,
  fs,
  tabState,
  scrollContainerRef,
  showFind,
  setShowFind,
  findQuery,
  setFindQuery,
  replaceQuery,
  setReplaceQuery,
  matchIndex,
  setMatchIndex,
  matches,
  setMatches,
  hasDiff,
  hasPendingDeletion,
  handleApprove,
  handleUndo,
  showSideBySide,
  setShowSideBySide,
  handleFormat,
  onCopy,
  associatedPath,
  onNavigateToAssociated,
  isReadOnly,
  setIsReadOnly,
  onSelectView,
  onStateChange,
  handleChange,
}: EditorToolingProps) {
  return (
    <>
      <HistoryHandler filePath={filePath} localContent={localContent} state={state} />
      <EditorHeader
        filePath={filePath}
        showFind={showFind}
        setShowFind={setShowFind}
        hasDiff={hasDiff}
        hasPendingDeletion={hasPendingDeletion}
        handleApprove={handleApprove}
        handleUndo={handleUndo}
        showSideBySide={showSideBySide}
        setShowSideBySide={setShowSideBySide}
        handleFormat={handleFormat}
        onCopy={onCopy}
        associatedPath={associatedPath}
        onNavigateToAssociated={onNavigateToAssociated}
        isReadOnly={isReadOnly}
        setIsReadOnly={setIsReadOnly}
        fileName={fileName}
        onSelectView={onSelectView}
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
        onStateChange={onStateChange}
      />
    </>
  );
}
