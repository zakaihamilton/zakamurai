import DiffHandler from './DiffHandler';
import EditorHeader from './EditorHeader';
import FindHandler from './FindHandler';
import HistoryHandler from './HistoryHandler';
import SyncHandler from './SyncHandler';
import type {
  DiffActions,
  EditorFileSystem,
  EditorStateStore,
  FindMatch,
  ScrollContainerRef,
  TabStateStore,
} from './types';

type EditorToolingProps = {
  filePath: string;
  fileName?: string;
  localContent: string;
  setLocalContent: (value: string | ((prev: string) => string)) => void;
  state: EditorStateStore;
  fs: EditorFileSystem;
  tabState: TabStateStore | undefined;
  scrollContainerRef: ScrollContainerRef;
  showFind: boolean;
  setShowFind: (value: boolean | ((prev: boolean) => boolean)) => void;
  findQuery: string;
  setFindQuery: (value: string) => void;
  replaceQuery: string;
  setReplaceQuery: (value: string) => void;
  matchIndex: number;
  setMatchIndex: (value: number | ((prev: number) => number)) => void;
  matches: FindMatch[];
  setMatches: (value: FindMatch[] | ((prev: FindMatch[]) => FindMatch[])) => void;
  hasDiff: boolean;
  hasPendingDeletion: boolean;
  handleApprove: () => void | Promise<void>;
  handleUndo: () => void | Promise<void>;
  showSideBySide: boolean;
  setShowSideBySide: (value: boolean | ((prev: boolean) => boolean)) => void;
  handleFormat: () => void;
  onCopy: () => void;
  associatedPath?: string | null;
  onNavigateToAssociated: () => void;
  isReadOnly: boolean;
  setIsReadOnly: (value: boolean | ((prev: boolean) => boolean)) => void;
  onSelectView: (viewType: string) => void;
  onStateChange: (actions: DiffActions) => void;
  handleChange: (event: { target: { value: string } }) => void;
};

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
