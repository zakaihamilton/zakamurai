import type { ChangeSetStateShape } from '@/components/state/domain-types';
import type { StateStore } from '@/components/state/types';
import type { AiChange } from '@/contracts/ai';

/** Updater callback for proxy-based state stores. */
export type DraftUpdater<T extends Record<string, unknown> = Record<string, unknown>> = (
  draft: T,
) => void;

/** State handle: callable updater with snapshot properties on the function object. */
export type StateHandle<T extends Record<string, unknown> = Record<string, unknown>> = T &
  ((updater: DraftUpdater<T>) => void);

export type FileMap = Record<string, string>;

export type FolderTreeNode = {
  name: string;
  type: 'folder' | 'file';
  children?: FolderTreeNode[];
};

export type Diff = {
  origStart?: number;
  origEnd?: number;
  updStart?: number;
  updEnd?: number;
  start?: number;
  end?: number;
  type?: string;
  original?: string;
  updated?: string;
};

export type ProcessingResult = {
  content: string;
  diffs: Diff[];
  failed?: boolean;
  reason?: string;
};

export type AIFileBlock = {
  filePath: string;
  content: string;
};

export type AIPlan = {
  objective: string;
  filesToModify: string[];
  keyChanges: string[];
};

export type AgentChange = {
  path: string;
  before?: string;
  after?: string;
  content?: string;
  filePath?: string;
};

export type ValidatedAIChanges = {
  accepted: AgentChange[];
  rejected: string[];
  details?: Array<{
    path?: string;
    error: string;
    type: string;
    failedContent?: string;
  }>;
};

export type AgentActionName =
  | 'list_files'
  | 'search_workspace'
  | 'search_semantic'
  | 'read_file'
  | 'write_file'
  | 'delete_file'
  | 'validate'
  | 'list_project_checks'
  | 'run_project_check'
  | 'inspect_preview'
  | 'finish';

export type AgentAction = {
  action: AgentActionName;
  query?: string;
  glob?: string;
  k?: number;
  path?: string;
  content?: string;
  reason?: string;
  check?: string;
  summary?: string;
};

export type AgentEventType = 'thinking' | 'tool' | 'observation' | 'finished';

export type AgentEvent = {
  type: AgentEventType;
  turn: number;
  agentRole?: string | null;
  message?: string;
  action?: AgentActionName | AgentAction;
  error?: boolean;
  changes?: AgentChange[];
};

export type AgentEventHandler = (event: AgentEvent) => void;

export type RoleKind = 'planner' | 'coder' | 'reviewer' | 'custom';

export type EdgeCondition = 'always' | 'approve' | 'reject' | 'success' | 'failure';

export type RoleNodeInput = {
  kind?: RoleKind | string;
  id?: string | null;
  label?: string | null;
  modelId?: string | null;
  systemPrompt?: string | null;
  allowedActions?: string[] | null;
  maxTurns?: number | null;
  join?: 'all' | 'any';
  maxRetries?: number;
};

export type RoleNode = {
  id: string;
  kind: RoleKind;
  label: string;
  modelId: string | null;
  systemPrompt: string | null;
  allowedActions: string[] | null;
  maxTurns: number | null;
  join: 'all' | 'any';
  maxRetries: number;
};

export type ResolvedRoleConfig = {
  id: string;
  kind: RoleKind;
  label: string;
  modelId: string | null;
  systemPrompt: string;
  allowedActions: string[];
  maxTurns: number;
  join: 'all' | 'any';
  maxRetries: number;
};

export type RoleEdge = {
  from: string;
  to: string;
  when: EdgeCondition;
  maxTimes?: number;
};

export type RoleGraph = {
  version: number;
  entryRoleId: string | null;
  roles: RoleNode[];
  edges: RoleEdge[];
};

export type RoleGraphValidation = {
  valid: boolean;
  errors: string[];
  graph: RoleGraph;
};

export type PlanSummary = {
  goals: string[];
  files: string[];
  steps: string[];
  raw: string;
};

export type ReviewSummary = {
  approved: boolean;
  fixes: string[];
  notes: string;
  raw: string;
};

export type VerificationResult = {
  status: string;
  check?: string;
  diagnostics?: string;
  output?: string;
};

export type SemanticSearchResult = {
  filePath?: string;
  path?: string;
  content?: string;
  preview?: string;
  score?: number;
};

export type WorkspaceIndex = {
  queryText: (query: string, limit: number) => Promise<Array<{ path: string; preview: string }>>;
};

export type WebLLMMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type WebLLMOptions = {
  model?: string;
  messages?: WebLLMMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  signal?: AbortSignal;
  contextWindowSize?: number;
  onInitProgress?: ((progress: string) => void) | null;
};

export type AskWebLLM = (
  prompt: string,
  systemPrompt?: string,
  onUpdate?: ((text: string) => void) | null,
  options?: WebLLMOptions,
) => Promise<string>;

export type WebLLMModel = {
  id: string;
  name: string;
  ramMB: number;
  storageMB: number;
  requirement: string;
  details: [string, string][];
  recommended: boolean;
};

export type WebLLMEngineState = {
  status?: string;
  progressText?: string;
  error?: string | null;
  generating?: boolean;
};

export type WebLLMStateDraft = {
  engines?: Record<string, WebLLMEngineState>;
  activeModelId?: string;
  cachedModelIds?: string[];
};

export type LogEntry = {
  id: string | number;
  role: string;
  text: string;
  timestamp: string;
};

export type PendingDiff = {
  originalContent: string;
  modifiedContent: string;
  originalCursorPos?: number;
  diffs: Diff[];
  changeSetId?: string;
};

export type EditorStateDraft = {
  fileContents?: FileMap;
  pendingDiffs?: Record<string, PendingDiff>;
  cursorPos?: Record<string, number | undefined>;
  selectedLines?: Record<string, number[]>;
};

export type SidebarStateDraft = {
  folderTree?: FolderTreeNode[];
  expandedFolders?: Record<string, boolean>;
};

export type LogStateDraft = {
  logs?: LogEntry[];
};

export type ChangeSetStateDraft = {
  items?: unknown[];
  activeId?: string | null;
};

export type TabState = {
  activeTabId?: string;
};

export type FileSystemLike = {
  rootHandle?: FileSystemDirectoryHandle | null;
  mode?: string | null;
  isReady?: boolean;
  getFileHandleAtPath?: (path: string) => Promise<FileSystemFileHandle | null>;
  readFile?: (handle: FileSystemFileHandle) => Promise<string>;
};

export type ProcessAIOptions = {
  esbuildTransform?: ((content: string, options: { loader: string }) => Promise<void>) | null;
  repairRunner?: ((prompt: string) => Promise<string | null>) | null;
  maxRepairRetries?: number;
};

export type ApplyAgentChangesStates = {
  editorState: StateHandle<EditorStateDraft> | null;
  sidebarState?: StateHandle<SidebarStateDraft> | null;
  logState?: StateHandle<LogStateDraft> | null;
  changeSetState?: StateStore<ChangeSetStateShape> | null;
  request?: string;
  validation?: unknown;
  autoApprove?: boolean;
};

export type ApplyAgentChangesResult = {
  applied: number;
  deletions: Array<{ path: string; before: string }>;
  changeSet?: ReturnType<typeof import('@/components/Workspace/ChangeSets').createChangeSet> | null;
};

export type ContextEntry = {
  type: string;
  text: string;
};

export type AgentContextOptions = {
  request?: string;
  priorContext?: string;
  maxContextChars?: number;
  maxItemChars?: number;
};

export type AgentContextSnapshot = {
  request: string;
  entries: ContextEntry[];
  text: string;
};

export type RunAgentOptions = {
  request: string;
  scope?: 'file' | 'project';
  activeFile?: string | null;
  selectedLines?: number[];
  files: FileMap;
  model: string;
  validate?: (files: FileMap) => Promise<VerificationResult | string> | VerificationResult | string;
  runProjectCheck?: (check: string, files: FileMap) => Promise<string>;
  inspectPreview?: (files: FileMap) => Promise<unknown>;
  retrieveContext?: (query: string, k: number) => Promise<SemanticSearchResult[]>;
  signal?: AbortSignal;
  onEvent?: AgentEventHandler;
  maxTurns?: number;
  systemPrompt?: string;
  allowedActions?: string[];
  priorContext?: string;
  workspace?: import('./Agent/Workspace').AgentWorkspace | null;
  agentRole?: string | null;
  workspaceIndex?: WorkspaceIndex | null;
};

export type RunAgentResult = {
  changes: AgentChange[];
  files: FileMap;
  summary: string;
  events: number;
  workspace: import('./Agent/Workspace').AgentWorkspace;
};

export type RunCollaborativeAgentOptions = Omit<
  RunAgentOptions,
  'systemPrompt' | 'allowedActions' | 'maxTurns' | 'agentRole' | 'workspace'
> & {
  roleGraph?: RoleGraph | null;
  onEvent?: AgentEventHandler;
};

export type RunCollaborativeAgentResult = {
  changes: AgentChange[];
  files: FileMap;
  summary: string;
  plan: PlanSummary | null;
  review: ReviewSummary | null;
  roleSummaries: Record<string, string>;
  roleGraph: RoleGraph;
  events: string;
};

export type SnapshotOptions = {
  onSkipped?: (info: { path: string; size: number; reason: string }) => void;
};

export type EsbuildTransform = (content: string, options: { loader: string }) => Promise<void>;

/** Re-export contract type for convenience in AI modules. */
export type { AiChange };
