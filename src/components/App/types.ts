import type {
  AgentSession,
  AgentSessionMessage,
  AgentSessionStateShape,
  AppStateShape,
  ChangeSetStateShape,
  EditorStateShape,
  LogStateShape,
  PendingDiff,
  PreviewStateShape,
  PromptStateShape,
  PromptUiStateShape,
  SidebarStateShape,
  SidebarUiStateShape,
  Tab,
  TabStateShape,
  TreeNode,
} from '@/components/state/domain-types';
import type { StateStore } from '@/components/state/types';
import type { RoleGraph } from '@/components/AI/types';
import type { LocalFsLike } from '@/utils/compiler/types';

/** Tree node after `normalizeChildren` assigns `path` and `type`. */
export type NormalizedTreeNode = TreeNode & {
  type: 'file' | 'folder';
  path: string[];
};

export type FlatTreeRow = {
  node: NormalizedTreeNode;
  level: number;
  pathStr: string;
};

/** Return type of `useFileSystem` from LocalFS. */
export type FileSystemApi = {
  mode: string | null;
  files: TreeNode[];
  error: string | null;
  version: number;
  currentDirHandle: FileSystemDirectoryHandle | null;
  rootHandle: FileSystemDirectoryHandle | null;
  mountOPFS: () => Promise<void>;
  mountLocal: () => Promise<void>;
  refreshDirectory: (
    dirHandle: FileSystemDirectoryHandle,
    updateSidebar?: boolean,
  ) => Promise<void>;
  triggerRefresh: () => void;
  readFile: (handle: FileSystemFileHandle) => Promise<string>;
  writeFile: (handle: FileSystemFileHandle, content: string) => Promise<void>;
  writeFileAtPath: (path: string[], content: string) => Promise<void>;
  readFileAtPath: (path: string[]) => Promise<string>;
  deleteFileAtPath: (path: string[]) => Promise<void>;
  getFileHandleAtPath: (path: string[]) => Promise<FileSystemFileHandle | null>;
  createFolder: (path: string[]) => Promise<void>;
  deleteEntry: (path: string[]) => Promise<void>;
  moveEntry: (fromPath: string[], toPath: string[]) => Promise<void>;
  unlinkProject: () => Promise<void>;
  isReady: boolean;
};

/** Adapt browser FileSystem API for compiler / agent modules expecting LocalFsLike. */
export function toCompilerFs(fs: FileSystemApi): LocalFsLike {
  return {
    mode: fs.mode || 'opfs',
    rootHandle: fs.rootHandle ?? undefined,
  };
}

export type InitialAppValues = {
  projectName: string;
  files: TreeNode[];
  contents: Record<string, string>;
  theme: string;
  tabs: Tab[];
  activeTabId: string | null;
  lastCodeTabId: string | null;
  aiLogs: import('@/components/state/domain-types').LogEntry[];
  sidebarWidth: number;
  promptWidth: number;
  isSidebarOpen: boolean;
  showAIInput: boolean;
  expandedFolders: Record<string, boolean>;
  aiCompletionEnabled: boolean;
  isReadOnly: boolean;
  promptHistory: string[];
  previewHtml: string | null;
  pendingDiffs: Record<string, PendingDiff>;
  agentSessions: AgentSessionStateShape;
  workspaceProfile: Partial<import('@/components/state/domain-types').WorkspaceProfileStateShape>;
  changeSets: ChangeSetStateShape;
};

/** Assert a state store exists (safe inside State provider components). */
export function requireStore<T extends object>(
  store: StateStore<T> | null | undefined,
): StateStore<T> {
  if (!store) {
    throw new Error('State store is not available in the current React tree.');
  }
  return store;
}

export type CreateAgentSessionOptions = {
  name?: string;
  mode?: 'single' | 'team' | string;
  modelId?: string | null;
  roleGraph?: RoleGraph | null;
  parentId?: string | null;
  messages?: AgentSessionMessage[];
};

export type AgentSessionTreeRow = {
  session: AgentSession;
  depth: number;
};

export type ShortcutActionContext = {
  appState: StateStore<AppStateShape>;
  sidebarState: StateStore<SidebarStateShape>;
  tabState: StateStore<TabStateShape>;
  editorState: StateStore<EditorStateShape>;
  logState: StateStore<LogStateShape>;
  promptState?: StateStore<PromptStateShape>;
  promptUiState?: StateStore<PromptUiStateShape>;
  agentSessionState?: StateStore<AgentSessionStateShape>;
  previewState?: StateStore<PreviewStateShape>;
  changeSetState?: StateStore<ChangeSetStateShape>;
  sidebarUiState?: StateStore<SidebarUiStateShape>;
  fs?: FileSystemApi;
  showNotification?: (
    message: string,
    type?: string,
    duration?: number,
    action?: { label: string; onClick: () => void } | null,
  ) => void;
  event?: KeyboardEvent;
};

export type SidebarFileLoaderParams = {
  fs: FileSystemApi;
  appState: StateStore<AppStateShape>;
  sidebarState: StateStore<SidebarStateShape>;
  tabState: StateStore<TabStateShape>;
  editorState: StateStore<EditorStateShape>;
  setLoadingPaths: Dispatch<SetStateAction<Record<string, boolean>>>;
  addNotification: (
    message: string,
    type?: string,
    duration?: number,
    action?: { label: string; onClick: () => void } | null,
  ) => void;
};

export type ShortcutDefinition = {
  id: string;
  group: string;
  desc: string;
  key: string | string[];
  displayKey: string;
  modifier?: string;
  platform?: 'mac' | 'win';
  isGlobal?: boolean;
  /** Omitted for editor-local shortcuts handled inside CodeEditor. */
  action?: (ctx: ShortcutActionContext) => void;
};

export type ShortcutGroupItem = {
  id: string;
  key: string;
  desc: string;
};

export type ShortcutGroup = {
  group: string;
  items: ShortcutGroupItem[];
};
