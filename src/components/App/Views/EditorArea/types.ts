import type { Diff } from '@/components/AI/types';
import type {
  CursorPosition,
  EditorStateShape,
  PendingDiff,
  TabStateShape,
} from '@/types/domain-types';
import type { FileContents, NavigationTarget, SourceLocation } from '@/utils/navigation/types';
import type { ChangeEvent, MutableRefObject, RefObject } from 'react';
import type { Draft, StateStore } from 'triactor';

// ---------------------------------------------------------------------------
// Extended editor state (runtime fields not in EditorStateShape)
// ---------------------------------------------------------------------------

export interface PendingDeletionEntry {
  originalContent: string;
  changeSetId: string;
}

export interface EditorScrollTarget {
  filePath: string;
  line: number;
  timestamp: number;
}

export interface ExtendedEditorState extends Omit<EditorStateShape, 'pendingDeletions'> {
  shouldScrollTo?: EditorScrollTarget | null;
  lastSaved?: string;
  pendingDeletions?: Record<string, PendingDeletionEntry | boolean>;
}

export type EditorStateStore = StateStore<ExtendedEditorState>;
export type EditorStateDraft = Draft<ExtendedEditorState>;
export type TabStateStore = StateStore<TabStateShape>;

// ---------------------------------------------------------------------------
// File system (subset used by EditorArea)
// ---------------------------------------------------------------------------

export interface EditorFileSystem {
  mode: string | null;
  rootHandle?: FileSystemDirectoryHandle | null;
  readFile?: (handle: FileSystemFileHandle) => Promise<string>;
  getFileHandleAtPath?: (path: string) => Promise<FileSystemFileHandle | null>;
  writeFileAtPath?: (path: string, content: string) => Promise<boolean | undefined>;
  deleteFileAtPath?: (path: string) => Promise<boolean | undefined>;
  readFileAtPath?: (path: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Folding
// ---------------------------------------------------------------------------

export interface CodeFold {
  id: string;
  startLine: number;
  endLine: number;
  placeholder?: string;
}

export type FoldStartMap = Record<number, CodeFold>;

export interface EditorLineItem {
  line: number;
  originalText?: string;
  placeholder?: string;
  fold?: CodeFold;
}

export interface VisibleFoldedContent {
  content: string;
  lineItems: EditorLineItem[];
  hasCollapsedFolds: boolean;
}

export type CollapsedFoldsMap = Record<string, string[]>;

// ---------------------------------------------------------------------------
// Find / replace
// ---------------------------------------------------------------------------

export interface FindMatch {
  line: number;
  index: number;
  absoluteIndex: number;
  length: number;
}

// ---------------------------------------------------------------------------
// Diff actions exposed to child views
// ---------------------------------------------------------------------------

export interface DiffActions {
  toggleLine?: (line: number) => void;
  handleCursorUpdate?: (pos: CursorPosition) => void;
  handleApprove?: () => void | Promise<void>;
  handleUndo?: () => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Navigation popup
// ---------------------------------------------------------------------------

export interface NavigationPopupTarget {
  filePath: string;
  fileName: string;
  loc: SourceLocation;
}

export interface NavigationPopupState {
  visible: boolean;
  x: number;
  y: number;
  className: string;
  targets: NavigationPopupTarget[];
  isCss: boolean;
  isImport: boolean;
  isExport: boolean;
  isComponent: boolean;
}

// ---------------------------------------------------------------------------
// Highlighting
// ---------------------------------------------------------------------------

export type HighlightStyles = Record<string, string>;

export interface HighlightEditorState {
  pendingDiffs?: Record<string, PendingDiff & { diffs?: Diff[] }>;
  selectedLines?: Record<string, number[]>;
  fileContents?: FileContents;
  cursorPos?: Record<string, CursorPosition>;
}

export interface HighlightTokenRange {
  start: number;
  end: number;
  startPosition: { line: number; column: number };
  endPosition: { line: number; column: number };
}

export interface HighlightDebugToken {
  index: number;
  type: string;
  className: string;
  value: string;
  escapedValue: string;
  range: HighlightTokenRange | null;
}

export interface HighlightDebug {
  filePath: string;
  languageMode: string;
  sourceLength: number;
  lineCount: number;
  maxHighlightChars: number;
  cacheable: boolean;
  largeFileFallback: boolean;
  selectedLines: number[];
  diffs: Diff[];
  suggestion: {
    text: string;
    cursorIndex?: number;
    cursorPosition: { line: number; column: number } | null;
  } | null;
  navigationLinksEnabled: boolean;
  navigationTargets: Array<NavigationTarget & { position?: { line: number; column: number } }>;
  search: {
    enabled: boolean;
    query: string;
    activeMatchIndex: number;
    matchCount: number;
  };
  tokens: HighlightDebugToken[];
}

export interface HighlightAnalysisParams {
  code: string;
  filePath: string;
  state?: HighlightEditorState;
  styles?: HighlightStyles;
  showFind?: boolean;
  findQuery?: string;
  matchIndex?: number;
  suggestion?: string;
  cursorPos?: CursorPosition;
  navigationLinksEnabled?: boolean;
  isOriginal?: boolean;
}

export interface HighlightCacheKeyParams {
  code: string;
  filePath: string;
  state?: HighlightEditorState;
  showFind?: boolean;
  findQuery?: string;
  matchIndex?: number;
  suggestion?: string;
  cursorPos?: CursorPosition;
  navigationLinksEnabled?: boolean;
  isOriginal?: boolean;
}

export interface HighlightWorkerMessage {
  id: number;
  code: string;
  filePath: string;
  state: HighlightEditorState;
  styles: HighlightStyles;
  showFind: boolean;
  findQuery: string;
  matchIndex: number;
  suggestion?: string;
  cursorPos?: CursorPosition;
  navigationLinksEnabled: boolean;
  isOriginal?: boolean;
}

export interface HighlightWorkerResponse {
  id: number;
  html?: string;
  error?: string;
}

export interface CancellableHighlightPromise extends Promise<string | null> {
  cancel?: () => void;
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

export interface CompletionDebugPayload {
  status: string;
  phase: string;
  filePath: string;
  prompt?: string;
  rawResult?: string;
  completion?: string;
  error?: string;
  cursor?: CursorPosition;
  model?: string;
  requestedAt?: string;
  completedAt?: string;
}

export interface CancelSuggestionOptions {
  pauseUntilEdit?: boolean;
  interrupt?: boolean;
  keepSuggestion?: boolean;
  report?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Scroll refs
// ---------------------------------------------------------------------------

export interface ShouldScrollRefValue {
  filePath: string;
  line: number;
}

export type ShouldScrollRef = MutableRefObject<ShouldScrollRefValue | null>;
export type ScrollContainerRef = RefObject<HTMLDivElement | null>;
export type TextareaRef = RefObject<HTMLTextAreaElement | null>;

// ---------------------------------------------------------------------------
// Component / hook props
// ---------------------------------------------------------------------------

export interface EditorAreaFile {
  name?: string;
  path?: string[];
  content?: string;
  kind?: string;
}

export interface EditorAreaProps {
  file?: EditorAreaFile;
  fsHandle?: FileSystemFileHandle;
}

export interface EditorToolingProps {
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
}

export interface CodeEditorProps {
  localContent: string;
  handleChange?: (e: ChangeEvent<HTMLTextAreaElement> | { target: { value: string } }) => void;
  highlightedCode: string;
  readOnly?: boolean;
  onCursorUpdate?: (pos: CursorPosition) => void;
  cursorPos?: CursorPosition;
  scrollContainerRef?: ScrollContainerRef;
  suggestion?: string;
  onAcceptSuggestion?: (text: string) => void;
  onCancelSuggestion?: (options?: CancelSuggestionOptions) => void;
  isCompleting?: boolean;
  filePath?: string;
  isReadOnly?: boolean;
  onCopySelection?: (content: string, start: number, end: number) => string | undefined;
  navigationLinksEnabled?: boolean;
  onNavigateToAssociated?: () => void;
  fileContents?: FileContents;
  onJumpToTarget?: (targetPath: string, targetLoc: SourceLocation) => void;
}

export interface NavigationPopupProps {
  popup: NavigationPopupState;
  onClose: () => void;
  onJumpToTarget?: (targetPath: string, targetLoc: SourceLocation) => void;
}

export interface GutterProps {
  linesCount?: number;
  linesArr?: string[];
  lineItems?: EditorLineItem[];
  selectedLines?: number[];
  toggleLine?: (line: number) => void;
  foldStarts?: FoldStartMap;
  collapsedFoldIds?: string[];
  toggleFold?: (foldId: string) => void;
  foldLabel?: string;
  scrollRef?: ScrollContainerRef;
}

export interface SingleEditorViewProps {
  scrollContainerRef: ScrollContainerRef;
  linesCount: number;
  editorLineItems: EditorLineItem[];
  selectedLines: number[];
  diffActions: DiffActions;
  foldStarts: FoldStartMap;
  collapsedFoldIds: string[];
  toggleFold: (foldId: string) => void;
  foldLabel: string;
  editorContent: string;
  handleChange: CodeEditorProps['handleChange'];
  highlightedCode: string;
  onCopySelection?: CodeEditorProps['onCopySelection'];
  cursorPos?: CursorPosition;
  suggestion?: string;
  onAcceptSuggestion?: (text: string) => void;
  cancelSuggestion?: (options?: CancelSuggestionOptions) => void;
  isCompleting?: boolean;
  filePath: string;
  isReadOnly: boolean;
  navigationLinksEnabled: boolean;
  handleNavigateToAssociated: () => void;
  fileContents: FileContents;
  handleJumpToTarget: (targetPath: string, targetLoc: SourceLocation) => void;
  hasCollapsedFolds?: boolean;
}

export interface SideBySideEditorViewProps {
  diffData: PendingDiff;
  isReadOnly: boolean;
  navigationLinksEnabled: boolean;
  filePath: string;
  handleNavigateToAssociated: () => void;
  fileContents: FileContents;
  handleJumpToTarget: (targetPath: string, targetLoc: SourceLocation) => void;
  linesCount: number;
  selectedLines: number[];
  diffActions: DiffActions;
  localContent: string;
  highlightedCode: string;
  originalHighlightedCode: string;
  handleChange: CodeEditorProps['handleChange'];
  cursorPos?: CursorPosition;
}

export interface EditorContentProps {
  showSideBySide: boolean;
  hasDiff: boolean;
  sideBySideProps: SideBySideEditorViewProps;
  singleEditorProps: SingleEditorViewProps;
}

export interface EditorSurfaceProps {
  toolingProps: EditorToolingProps;
  contentProps: EditorContentProps;
}

export interface EditorHeaderProps {
  filePath: string;
  showFind: boolean;
  setShowFind: (value: boolean | ((prev: boolean) => boolean)) => void;
  hasDiff: boolean;
  hasPendingDeletion?: boolean;
  handleApprove: () => void | Promise<void>;
  handleUndo: () => void | Promise<void>;
  showSideBySide: boolean;
  setShowSideBySide: (value: boolean | ((prev: boolean) => boolean)) => void;
  handleFormat: () => void;
  onCopy: () => void;
  isReadOnly: boolean;
  setIsReadOnly: (value: boolean | ((prev: boolean) => boolean)) => void;
  fileName?: string;
  viewType?: string;
  onSelectView: (viewType: string) => void;
  associatedPath?: string | null;
  onNavigateToAssociated?: () => void;
}

export interface FindReplaceBarProps {
  showFind: boolean;
  setShowFind: (value: boolean | ((prev: boolean) => boolean)) => void;
  findQuery: string;
  setFindQuery: (value: string) => void;
  replaceQuery: string;
  setReplaceQuery: (value: string) => void;
  matches: FindMatch[];
  matchIndex: number;
  setMatchIndex: (value: number | ((prev: number) => number)) => void;
  handleFind: () => void;
  handleReplace: () => void;
  handleReplaceAll: () => void;
}

export interface FindHandlerProps {
  localContent: string;
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
  handleChange: CodeEditorProps['handleChange'];
}

export interface HistoryHandlerProps {
  filePath: string;
  localContent: string;
  state: EditorStateStore;
}

export interface ScrollHandlerProps {
  filePath: string;
  state: EditorStateStore;
  scrollContainerRef: ScrollContainerRef;
  shouldScrollRef: ShouldScrollRef;
}

export interface SyncHandlerProps {
  fs: EditorFileSystem;
  filePath: string;
  localContent: string;
  state: EditorStateStore;
  tabState: TabStateStore | undefined;
}

export interface DiffHandlerProps {
  filePath: string;
  localContent: string;
  setLocalContent: (value: string | ((prev: string) => string)) => void;
  state: EditorStateStore;
  fs: EditorFileSystem;
  onStateChange: (actions: DiffActions) => void;
}

export interface FileLoaderProps {
  filePath: string;
  localContent: string;
  setLocalContent: (value: string | ((prev: string) => string)) => void;
  fallbackContent: string;
  fs: EditorFileSystem;
  fsHandle?: FileSystemFileHandle;
  state: EditorStateStore;
}

export interface HighlightLoaderProps {
  showSideBySide: boolean;
  hasDiff: boolean;
  localContent: string;
  editorContent: string;
  filePath: string;
  state: HighlightEditorState | EditorStateStore;
  showFind: boolean;
  findQuery: string;
  matchIndex: number;
  suggestion?: string;
  cursorPos?: CursorPosition;
  navigationLinksEnabled: boolean;
  diffData?: PendingDiff;
}

export interface CodeFoldingProps {
  filePath: string;
  localContent: string;
  collapsedFolds: CollapsedFoldsMap;
  setCollapsedFolds: (
    value: CollapsedFoldsMap | ((prev: CollapsedFoldsMap) => CollapsedFoldsMap),
  ) => void;
}

export interface EditorBufferProps {
  file?: EditorAreaFile;
  filePath: string;
  fs: EditorFileSystem;
  fsHandle?: FileSystemFileHandle;
  state: EditorStateStore;
}

export interface AssociationNavigatorProps {
  filePath: string;
  cursorPos?: CursorPosition;
  localContentRef: MutableRefObject<string>;
  state: EditorStateStore;
  tabState: TabStateStore | undefined;
  shouldScrollRef: ShouldScrollRef;
}

export interface CompletionHandlerProps {
  localContent: string;
  cursorPos?: CursorPosition;
  filePath: string;
  enabled?: boolean;
  onDebugUpdate?: (debug: CompletionDebugPayload) => void;
}

export interface EditorShortcutsProps {
  handleChange: CodeEditorProps['handleChange'];
  textareaRef: TextareaRef;
  scrollContainerRef?: ScrollContainerRef;
  suggestion?: string;
  isCompleting?: boolean;
  onAcceptSuggestion?: (text: string) => void;
  onCancelSuggestion?: (options?: CancelSuggestionOptions) => void;
  filePath?: string;
  onNavigateToAssociated?: () => void;
  onRequestJumpToLine?: () => void;
}

export interface NavigationHistoryEntry {
  filePath: string;
  loc: SourceLocation;
  label: string;
}

export interface NavigationHistoryStack {
  stack: NavigationHistoryEntry[];
  currentIndex: number;
}
