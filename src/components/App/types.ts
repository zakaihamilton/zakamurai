import type { ExtendedEditorState } from '@/components/App/Views/EditorArea/types';
import type { StateStore } from '@/components/state/types';
import type {
  AgentSession,
  AgentSessionMessage,
  AgentSessionStateShape,
  AppStateShape,
  ChangeSetStateShape,
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
} from '@/types/domain-types';
import type { LocalFsLike } from '@/utils/compiler/types';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';

/** Tree node after `normalizeChildren` assigns `path` and `type`. */
export type NormalizedTreeNode = TreeNode & {
  type: 'file' | 'folder';
  path: string[];
};

export type FlatTreeRow = {
  item: NormalizedTreeNode & {
    isRoot?: boolean;
    handle?: FileSystemFileHandle | FileSystemDirectoryHandle | null;
  };
  level: number;
  path: string[];
  pathStr: string;
  key?: string;
};

/** CSS module custom properties (e.g. `--panel-width`). */
export type CssCustomProperties = CSSProperties & Record<`--${string}`, string | number>;

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
  ) => Promise<
    Array<{ name: string; kind: FileSystemHandleKind; handle: FileSystemHandle }> | undefined
  >;
  triggerRefresh: () => void;
  readFile: (handle: FileSystemFileHandle) => Promise<string>;
  writeFile: (
    filename: string,
    content: string,
    dirHandle?: FileSystemDirectoryHandle | null,
  ) => Promise<void>;
  writeFileAtPath: (
    path: string,
    content: string,
    root?: FileSystemDirectoryHandle | null,
  ) => Promise<boolean>;
  readFileAtPath: (path: string, root?: FileSystemDirectoryHandle | null) => Promise<string>;
  deleteFileAtPath: (path: string, root?: FileSystemDirectoryHandle | null) => Promise<boolean>;
  getFileHandleAtPath: (
    path: string,
    root?: FileSystemDirectoryHandle | null,
  ) => Promise<FileSystemFileHandle | null>;
  createFolder: (folderName: string, dirHandle?: FileSystemDirectoryHandle | null) => Promise<void>;
  deleteEntry: (name: string, dirHandle?: FileSystemDirectoryHandle | null) => Promise<void>;
  moveEntry: (
    sourceHandle: FileSystemHandle,
    destinationDirHandle: FileSystemDirectoryHandle,
    newName?: string | null,
  ) => Promise<void>;
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
  aiLogs: import('@/types/domain-types').LogEntry[];
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
  pendingDeletions: import('@/types/domain-types').EditorStateShape['pendingDeletions'];
  agentSessions: AgentSessionStateShape;
  workspaceProfile: Partial<import('@/types/domain-types').WorkspaceProfileStateShape>;
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
  /** Legacy persisted field; ignored by the AI Manager. */
  roleGraph?: unknown;
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
  editorState: StateStore<ExtendedEditorState>;
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
  editorState: StateStore<import('@/components/App/Views/EditorArea/types').ExtendedEditorState>;
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
