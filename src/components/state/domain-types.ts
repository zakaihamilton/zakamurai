import type { AIIncident } from '@/components/AI/Agent/AIIncident';
import type { ManagerTrace } from '@/components/AI/Agent/ManagerTrace';
import type { DeviceCapabilityReport } from '@/contracts/capabilities';
import type { DiagnosticEvent } from '@/contracts/runtime';
import type { SourceLocation } from '@/utils/navigation/types';

// ---------------------------------------------------------------------------
// Shared domain types
// ---------------------------------------------------------------------------

export type TreeNodeType = 'file' | 'folder';

export interface TreeNode {
  name: string;
  type: TreeNodeType;
  path: string[];
  children?: TreeNode[];
  kind?: string;
  content?: string;
  [key: string]: unknown;
}

export interface TabFileRef {
  name: string;
  path?: string[];
  content?: string;
}

export type TabType =
  | 'file'
  | 'preview'
  | 'logs'
  | 'token-breakdown'
  | 'project-info'
  | 'instructions'
  | 'readiness'
  | 'ai-section';

export interface Tab {
  id: string;
  type: TabType;
  label: string;
  file?: TabFileRef;
  viewType?: string;
  sourceFilePath?: string;
  fsHandle?: FileSystemFileHandle;
  [key: string]: unknown;
}

export interface CursorPosition {
  line: number;
  col: number;
  index?: number;
}

export interface HistorySnapshot {
  content: string;
  cursor: CursorPosition;
}

export interface FileHistory {
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  lastSnapshotContent?: string;
  lastSnapshotCursor?: CursorPosition;
}

export interface PendingDiff {
  originalContent: string;
  modifiedContent: string;
  originalCursorPos?: CursorPosition;
  diffs: unknown[];
  changeSetId?: string;
}

export interface NavigationHistoryEntry {
  filePath: string;
  label: string;
  loc: SourceLocation;
}

export interface NavigationHistory {
  stack: NavigationHistoryEntry[];
  currentIndex: number;
}

export interface LogEntry {
  id: string | number;
  role: string;
  text: string;
  timestamp: string;
}

export interface NotificationItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | string;
  action?: {
    label: string;
    onClick: () => void;
  } | null;
}

export interface ProblemItem {
  source: string;
  severity: string;
  message: string;
  location?: unknown;
  createdAt?: number;
}

export interface ChangeSetFile {
  path: string;
  originalContent?: string;
  proposedContent?: string;
  deleted?: boolean;
  hunks?: unknown[];
  status?: string;
}

export interface ChangeSet {
  id: string;
  request: string;
  files: ChangeSetFile[];
  validation?: unknown;
  status: string;
  createdAt: number;
}

export interface AgentSessionMessage {
  id: number;
  role: string;
  text: string;
  timestamp: string;
  agentRole?: string;
}

export interface AgentReasoningEntry {
  text: string;
  timestamp: string;
  turn?: number;
  input?: string;
  output?: string;
}

export interface AgentRunUsage {
  modelIds: string[];
  modelCalls: number;
  outcomes: { success: number; error: number; aborted: number };
  promptTokens: number;
  promptTokenCalls: number;
  completionTokens: number;
  completionTokenCalls: number;
  totalMs: number;
  timeToFirstTokenMs: number;
  timeToFirstTokenCalls: number;
  decodeTokensPerSecond: number;
  decodeTokensPerSecondCalls: number;
  toolCalls: Record<string, number>;
}

export interface AgentSession {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  mode: 'single' | 'team';
  modelId: string | null;
  roleGraph: unknown;
  messages: AgentSessionMessage[];
  reasoning: string;
  reasoningEvents?: AgentReasoningEntry[];
  showStepIO?: boolean;
  runUsage?: AgentRunUsage;
  status: string;
}

export interface WebLLMEngineState {
  status?: string;
  generating?: boolean;
  error?: string | null;
  progress?: number;
  progressText?: string;
  [key: string]: unknown;
}

export interface AiCompletionDebug {
  status: string;
  phase?: string;
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

export interface CompletionActivity {
  status?: string;
  [key: string]: unknown;
}

export interface WorkspaceSkippedFile {
  path: string;
  reason?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// State store shapes
// ---------------------------------------------------------------------------

export interface AppStateShape {
  theme: string;
  projectName: string;
  showShortcuts: boolean;
  showCompletionDebug: boolean;
  isResizing: boolean;
  isMobile: boolean;
  compileRequest: number;
  silentCompileRequest: number;
}

export interface SidebarStateShape {
  isSidebarOpen: boolean;
  showAIInput: boolean;
  isSidebarPopupOpen: boolean;
  isAIInputPopupOpen: boolean;
  folderTree: TreeNode[];
  sidebarWidth: number;
  expandedFolders: Record<string, boolean>;
  draggedItem?: {
    path?: string[];
    handle?: FileSystemHandle;
    type?: string;
    name?: string;
  } | null;
}

export interface SidebarUiStateShape {
  filterText: string;
  loadingPaths: Record<string, boolean>;
  dropTargetPath: string | null;
  animatedWidth: number;
  creatingAt: { pathStr: string; type: string } | null;
}

export interface TabStateShape {
  openTabs: Tab[];
  activeTabId: string | null;
  lastCodeTabId: string | null;
}

export interface TabBarUiStateShape {
  draggedTabId: string | null;
  dropTargetId: string | null;
  isOverBar: boolean;
}

export interface EditorStateShape {
  fileContents: Record<string, string>;
  aiCompletionEnabled: boolean;
  isReadOnly: boolean;
  navigationHistory: NavigationHistory;
  pendingDiffs: Record<string, PendingDiff>;
  pendingDeletions: Record<string, boolean | { originalContent?: string; changeSetId?: string }>;
  cursorPos?: Record<string, CursorPosition>;
  selectedLines?: Record<string, number[]>;
  history?: Record<string, FileHistory>;
  isCompleting?: Record<string, boolean>;
  completionActivity?: Record<string, CompletionActivity>;
  aiCompletionDebug?: AiCompletionDebug;
}

export interface EditorAreaUiStateShape {
  localContent: string;
  showFind: boolean;
  findQuery: string;
  replaceQuery: string;
  matchIndex: number;
  matches: unknown[];
  showSideBySide: boolean;
  diffActions: Record<string, unknown>;
  collapsedFolds: Record<string, unknown>;
}

export interface LogStateShape {
  isSystemProcessing: boolean;
  isAIProcessing: boolean;
  logs: LogEntry[];
  reasoning?: string;
}

export interface LogAreaUiStateShape {
  copied: boolean;
  autoScroll: boolean;
  filterText: string;
}

export interface PromptStateShape {
  promptWidth: number;
  promptHistory: string[];
}

export type PromptMode = 'ask' | 'plan' | 'edit' | 'fix';

export interface PromptUiStateShape {
  val: string;
  historyIndex: number;
  draftVal: string;
  welcomePrompt: string;
  selectedModel: string;
  isModelManagerOpen: boolean;
  cachedModelIds: string[];
  modelCacheWork: unknown;
  modelCacheProgress: string;
  modelCacheError: string;
  animatedWidth: number;
  abortController: AbortController | null;
  promptScope: string;
  promptMode: PromptMode;
  welcomeRequest: unknown;
  runningSessionId: string | null;
  isAgentTreeOpen: boolean;
  latestManagerTrace: ManagerTrace | null;
  latestAIIncident: AIIncident | null;
  sessionDialog?: import('@/components/App/Panes/Prompt/prompt-types').SessionDialogState;
}

export interface AgentSessionStateShape {
  sessions: Record<string, AgentSession>;
  activeSessionId: string | null;
}

export interface PreviewStateShape {
  htmlContent: string | null;
  isCompilerReady: boolean;
  previewAddress: string;
  previewSessionId: string | null;
  containerStatus: string;
  compileStatus: string;
  compilePhase: string | null;
  lastCompileAt: number | null;
  containerError: string | null;
  restoreError?: string | null;
  compileError?: string | null;
  compileDiagnostic?: unknown;
  serverError?: string | null;
}

export interface PreviewAreaUiStateShape {
  isLoading: boolean;
  scale: number;
  error: string | null;
  refreshKey: number;
  isSwReady: boolean;
  isMaximized: boolean;
  address: string;
  host: string;
}

export interface NotificationStateShape {
  notifications: NotificationItem[];
}

export interface DiagnosticsStateShape {
  events: Array<DiagnosticEvent & { id: string }>;
}

export interface StorageHealthStateShape {
  status: string;
  layer: string | null;
  message: string | null;
  quotaWarning?: boolean;
  usage?: number;
  quota?: number;
  lastSuccessfulPersistAt?: number | null;
}

export interface FileSystemStateShape {
  rootHandle: FileSystemDirectoryHandle | null;
  currentDirHandle: FileSystemDirectoryHandle | null;
  files: TreeNode[];
  mode: string | null;
  error: string | null;
  version: number;
  refreshTrigger: number;
  isReady: boolean;
}

export interface RagStateShape {
  status: string;
  error: string | null;
  indexedFileCount: number;
  lastIndexedAt: number | null;
  lastFingerprint: string | null;
}

export interface WebLLMStateShape {
  cachedModelIds: string[];
  engines: Record<string, WebLLMEngineState>;
  activeModelId: string | null;
  capabilityReport: DeviceCapabilityReport | null;
}

export interface WorkspaceProfileStateShape {
  include: string[];
  exclude: string[];
  maxFileBytes: number;
}

export interface WorkspaceHealthStateShape {
  status: string;
  error: string | null;
  totalFiles: number;
  indexedFiles: number;
  indexedBytes: number;
  skippedFiles: WorkspaceSkippedFile[];
  lastIndexedAt: number | null;
}

export interface ProblemsStateShape {
  items: ProblemItem[];
}

export interface ChangeSetStateShape {
  activeId: string | null;
  items: ChangeSet[];
}

export interface KeyboardShortcutStateShape {
  shouldShow: boolean;
}

export interface SelectStateShape {
  isOpen: boolean;
  opensUp: boolean;
}

export interface TooltipStateShape {
  isVisible: boolean;
  coords: { top: number; left: number };
  placement: string;
  arrowOffset: number;
}

export interface ResizerStateShape {
  isResizing: boolean;
}

export interface TopBarMenuStateShape {
  menuPosition: { x: number; y: number } | null;
  confirmNewProject: boolean;
}

export interface GutterStateShape {
  viewport: { scrollTop: number; height: number };
}

export interface VirtualListStateShape {
  scrollTop: number;
  height: number;
}

export interface ImageViewerStateShape {
  imageUrl: string | null;
  error: string | null;
  scale: number;
  showGrid: boolean;
}

export interface TreeItemStateShape {
  isEditing: boolean;
  editValue: string;
  createValue?: string;
  contextMenu: { x: number; y: number } | null;
  showDeleteDialog: boolean;
}

export interface CompletionStateShape {
  suggestion: string;
  loading: boolean;
}

export interface CompletionDebugStateShape {
  copied: boolean;
}
