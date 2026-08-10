import type { ChangeSetStateShape } from '@/components/state/domain-types';
import type { StateStore } from '@/components/state/types';
import type { AiChange } from '@/contracts/ai';
import type { DeviceCapabilityReport } from '@/contracts/capabilities';

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
  delete?: boolean;
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
  | 'replace_file_content'
  | 'delete_file'
  | 'validate'
  | 'list_project_checks'
  | 'run_project_check'
  | 'inspect_preview'
  | 'inspect_console_logs'
  | 'get_file_symbols'
  | 'manage_packages'
  | 'finish';

export type AgentAction = {
  action: AgentActionName;
  query?: string;
  glob?: string;
  k?: number;
  path?: string;
  content?: string;
  search?: string;
  replace?: string;
  reason?: string;
  check?: string;
  summary?: string;
  level?: 'log' | 'warn' | 'error';
  packageName?: string;
  version?: string;
  isDev?: boolean;
};

export type AgentEventType = 'thinking' | 'tool' | 'observation' | 'model_io' | 'finished';

export type AgentEvent = {
  type: AgentEventType;
  turn: number;
  agentRole?: string | null;
  message?: string;
  input?: string;
  output?: string;
  action?: AgentActionName | AgentAction;
  error?: boolean;
  changes?: AgentChange[];
  /** Marks synthetic writes produced by a recovery path rather than the model. */
  provenance?: 'model' | 'recovery';
  /** Replace the current transient progress line instead of adding a new transcript entry. */
  replaceProgress?: boolean;
};

export type AgentEventHandler = (event: AgentEvent) => void;

export type ManagerIntent =
  | 'workspace-query'
  | 'project-check'
  | 'preview-inspection'
  | 'explanation'
  | 'edit'
  | 'mixed';

export type ManagerToolName =
  | 'list_files'
  | 'search_workspace'
  | 'search_semantic'
  | 'read_file'
  | 'validate'
  | 'list_project_checks'
  | 'run_project_check'
  | 'inspect_preview'
  | 'inspect_console_logs'
  | 'get_file_symbols'
  | 'manage_packages';

export type ContextRequest = {
  tool: Extract<
    ManagerToolName,
    | 'list_files'
    | 'search_workspace'
    | 'search_semantic'
    | 'read_file'
    | 'inspect_console_logs'
    | 'get_file_symbols'
    | 'manage_packages'
  >;
  input?: Record<string, unknown>;
};

export type ManagerStep =
  | { kind: 'tool'; tool: ManagerToolName; input?: Record<string, unknown>; reason: string }
  | { kind: 'model'; task: 'answer' | 'generate-changes' | 'repair-changes'; reason: string };

export type ManagerPlan = {
  intent: ManagerIntent;
  steps: ManagerStep[];
  modelRequired: boolean;
  confidence: 'high' | 'fallback';
};

export type ModelResult =
  | { kind: 'answer'; summary: string }
  | { kind: 'request-context'; requests: ContextRequest[] }
  | { kind: 'changes'; summary: string; changes: AgentChange[] };

export type ManagerEventType = 'routing' | 'tool' | 'context' | 'model' | 'validation' | 'finished';

export type ManagerEvent = {
  type: ManagerEventType;
  turn: number;
  message?: string;
  /** Replace the current transient progress line instead of adding a new transcript entry. */
  replaceProgress?: boolean;
  tool?: ManagerToolName;
  action?: AgentActionName | AgentAction;
  task?: 'answer' | 'generate-changes' | 'repair-changes';
  input?: string;
  output?: string;
  error?: boolean;
  provenance?: 'model' | 'recovery';
  plan?: ManagerPlan;
  protocolStatus?: 'request-sent' | 'response-received' | 'valid' | 'invalid';
};

export type ManagerEventHandler = (event: ManagerEvent) => void;

export type ManagerModelCall = {
  model: string;
  messages: WebLLMMessage[];
  signal?: AbortSignal;
  task: 'answer' | 'generate-changes' | 'repair-changes';
  temperature: number;
  top_p: number;
  max_tokens: number;
  contextWindowSize?: number;
  /** Repeatable sampling for qualification runs. Production calls normally omit this. */
  seed?: number;
  responseFormat?: ModelResponseFormat;
  taskKind?: ModelTaskKind;
  attempt?: number;
  onMetrics?: (metrics: WebLLMGenerationMetrics) => void;
  onRecovery?: (event: WebLLMRecoveryEvent) => void;
  /** Stable prompt-conversation key used by the worker-resident context session. */
  sessionId?: string;
};

export type ManagerModelClient = (call: ManagerModelCall) => Promise<string>;

/** Compatibility options for the proven iterative action runner used by ManagerRunner. */
export type RunAgentOptions = {
  request: string;
  scope?: 'file' | 'project';
  activeFile?: string | null;
  selectedLines?: number[];
  files: FileMap;
  model: string;
  sessionId?: string;
  validate?: (files: FileMap) => Promise<VerificationResult | string> | VerificationResult | string;
  runProjectCheck?: (check: string, files: FileMap) => Promise<string>;
  inspectPreview?: (files: FileMap) => Promise<unknown>;
  retrieveContext?: (query: string, k: number) => Promise<SemanticSearchResult[]>;
  signal?: AbortSignal;
  onEvent?: AgentEventHandler;
  onMetrics?: (metrics: WebLLMGenerationMetrics) => void;
  maxTurns?: number;
  systemPrompt?: string;
  allowedActions?: string[];
  priorContext?: string;
  workspace?: import('./Agent/Workspace').AgentWorkspace | null;
  agentRole?: string | null;
  workspaceIndex?: WorkspaceIndex | null;
  visualMode?: boolean;
  requirePreviewInspection?: boolean;
  modelClient?: ManagerModelClient;
  /** Optional worker-resident model session. Falls back to the legacy client when absent. */
  modelSession?: AgentModelSession;
  styleProfile?: import('./Agent/ProjectStyleProfile').ProjectStyleProfile;
  /** Qualification-only deterministic sampling seed. */
  seed?: number;
};

export type AgentModelSession = {
  id: string;
  generate: (call: ManagerModelCall) => Promise<string>;
  dispose?: () => Promise<void>;
};

export type RunAgentResult = {
  changes: AgentChange[];
  files: FileMap;
  summary: string;
  events: number;
  workspace: import('./Agent/Workspace').AgentWorkspace;
};

export type ManagerToolOptions = {
  validate?: (files: FileMap) => Promise<VerificationResult | string> | VerificationResult | string;
  runProjectCheck?: (check: string, files: FileMap) => Promise<string>;
  inspectPreview?: (files: FileMap) => Promise<unknown>;
  retrieveContext?: (query: string, k: number) => Promise<SemanticSearchResult[]>;
  inspectConsoleLogs?: (
    query?: string,
    level?: 'log' | 'warn' | 'error',
  ) => Promise<unknown> | unknown;
  onPackageChange?: (
    action: 'list' | 'add' | 'remove',
    packageName?: string,
    version?: string,
  ) => Promise<unknown> | unknown;
};

export type RunManagerOptions = ManagerToolOptions & {
  request: string;
  scope?: 'file' | 'project';
  activeFile?: string | null;
  selectedLines?: number[];
  files: FileMap;
  model: string;
  signal?: AbortSignal;
  onEvent?: ManagerEventHandler;
  onMetrics?: (metrics: WebLLMGenerationMetrics) => void;
  onRecovery?: (event: WebLLMRecoveryEvent) => void;
  priorContext?: string;
  workspaceIndex?: WorkspaceIndex | null;
  modelClient?: ManagerModelClient;
  sessionId?: string;
  modelSession?: AgentModelSession;
  onTrace?: (trace: import('./Agent/ManagerTrace').ManagerTrace) => void;
  styleProfile?: import('./Agent/ProjectStyleProfile').ProjectStyleProfile;
  /** Qualification-only deterministic sampling seed. */
  seed?: number;
};

export type RunManagerResult = {
  changes: AgentChange[];
  files: FileMap;
  summary: string;
  plan: ManagerPlan;
  events: number;
  workspace: import('./Agent/Workspace').AgentWorkspace;
  trace: import('./Agent/ManagerTrace').ManagerTrace;
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

export type WebLLMRequestKind = 'agent' | 'completion' | 'model-cache' | 'general';

export type ModelTaskKind = 'plan-edit' | 'write-file' | 'repair-file' | 'answer' | 'completion';

export type ModelResponseFormat =
  | { type: 'json_object'; schema?: string }
  | { type: 'grammar'; grammar: string };

export type TaskContract = {
  version: 1;
  request: string;
  scope: 'file' | 'project';
  activeFile: string | null;
  allowedPaths: string[];
  acceptanceCriteria: string[];
  requiredValidations: Array<'content' | 'build' | 'preview' | 'console'>;
  maxModelCalls: number;
  maxRepairRounds: number;
};

export type ModelTask =
  | { kind: 'plan-edit'; contract: TaskContract; evidence: string }
  | {
      kind: 'write-file';
      contract: TaskContract;
      targetPath: string;
      currentContent: string;
      relatedFiles: FileMap;
    }
  | {
      kind: 'repair-file';
      contract: TaskContract;
      targetPath: string;
      currentContent: string;
      diagnostics: string;
      attempt: number;
    }
  | { kind: 'answer'; contract: TaskContract; evidence: string }
  | { kind: 'completion'; filePath: string; before: string; after: string };

export type ModelCapabilityProfile = {
  tier: 'recommended' | 'compact' | 'recovery';
  contextWindowSize: number;
  generationTokens: number;
  recoveryTokens: number;
  filesPerGeneration: 1;
  supportsAllTaskKinds: true;
  hostAssistance: 'standard' | 'enhanced';
};

export type WebLLMRecoveryReason =
  | 'device-lost'
  | 'out-of-memory'
  | 'worker-failure'
  | 'stalled'
  | 'network-failure'
  | 'invalid-context';

export type WebLLMRecoveryEvent = {
  requestedModelId: string;
  modelId: string;
  phase: 'initialization' | 'generation';
  action: 'retry' | 'fallback' | 'reuse-fallback';
  reason: WebLLMRecoveryReason;
  attempt: number;
};

export type WebLLMGenerationMetrics = {
  requestKind: WebLLMRequestKind;
  requestedModelId: string;
  modelId: string;
  outcome: 'success' | 'aborted' | 'error';
  startedAt: number;
  totalMs: number;
  initializationMs?: number;
  timeToFirstTokenMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  decodeTokensPerSecond?: number;
  finishReason?: string | null;
  recoveryCount: number;
  jsHeapUsedMBAtStart?: number;
  jsHeapUsedMBAtEnd?: number;
  jsHeapDeltaMB?: number;
  failurePhase?: 'initialization' | 'generation';
  errorName?: string;
  errorMessageLength?: number;
  errorMessageFingerprint?: string;
  sessionState?: 'hit' | 'cold-start' | 'rehydrated' | 'compacted' | 'evicted';
  submittedDeltaBytes?: number;
  submittedDeltaTokens?: number;
  reusedContextTokens?: number;
  taskKind?: ModelTaskKind;
  attempt?: number;
  structuredOutput?: boolean;
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
  requestKind?: WebLLMRequestKind;
  initStallTimeoutMs?: number;
  firstTokenTimeoutMs?: number;
  chunkIdleTimeoutMs?: number;
  onRecovery?: ((event: WebLLMRecoveryEvent) => void) | null;
  onMetrics?: ((metrics: WebLLMGenerationMetrics) => void) | null;
  sessionId?: string;
  seed?: number;
  responseFormat?: ModelResponseFormat;
  taskKind?: ModelTaskKind;
  attempt?: number;
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
  capabilityReport?: DeviceCapabilityReport | null;
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

export type SnapshotOptions = {
  onSkipped?: (info: { path: string; size: number; reason: string }) => void;
};

export type EsbuildTransform = (content: string, options: { loader: string }) => Promise<void>;

/** Re-export contract type for convenience in AI modules. */
export type { AiChange };
