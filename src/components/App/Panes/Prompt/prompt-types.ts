import type { ManagerTrace } from '@/components/AI/Agent/ManagerTrace';
import type { ModelOption, ModelSelectOption } from '@/components/AI/Models/model-types';
import type { AgentEvent, FileMap } from '@/components/AI/types';
import type { ExtendedEditorState } from '@/components/App/Views/EditorArea/types';
import type { FileSystemApi } from '@/components/App/types';
import type {
  AgentSession,
  AgentSessionMessage,
  AgentSessionStateShape,
  LogStateShape,
  PromptUiStateShape,
  SidebarStateShape,
  TabStateShape,
} from '@/components/state/domain-types';
import type { StateStore } from '@/components/state/types';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';

export type WelcomeRequest = {
  text: string;
  scope: string;
};

export type SessionManagerProps = {
  activeSession: AgentSession | null;
  onOpenTree: () => void;
  isOpen?: boolean;
};

export type SessionDialogProps = {
  sessionDialog: SessionDialogState;
  runningSessionId: string | null;
  isAIProcessing: boolean;
  agentSessionState: StateStore<AgentSessionStateShape> | null;
  promptUiState: StateStore<PromptUiStateShape>;
};

export type SessionTreeDialogProps = {
  isOpen: boolean;
  sessions?: Record<string, AgentSession>;
  activeSessionId?: string | null;
  onCancel: () => void;
  onSelect: (sessionId: string) => void;
  onCreate: () => void;
  onBranch: (sessionId: string) => void;
  onRename: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
};

export type UsePromptLayoutParams = {
  isMobile: boolean;
  isOpen: boolean;
  promptWidth: number;
  animatedWidth: number;
  promptUiState: StateStore<PromptUiStateShape>;
};

export type UsePromptLayoutResult = {
  desktopWidth: string;
};

export type PromptComposerProps = {
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStop: (event: React.MouseEvent<HTMLButtonElement>) => void;
  isAIProcessing: boolean;
  isButtonActive: boolean;
  isOpen: boolean;
  selectedModelInfo?: { id: string; name?: string };
  modelOptions?: ModelSelectOption[];
  onChangeModel?: (modelId: string) => void;
  onLoadCachedModelIds?: () => void;
  onOpenModelManager?: () => void;
};

export type PromptSessionAreaProps = {
  activeSession: AgentSession | null;
  isOpen: boolean;
  isAgentTreeOpen: boolean;
  sessionDialog: SessionDialogState;
  agentSessionState: StateStore<AgentSessionStateShape> | null;
  onOpenTree: () => void;
  onCloseTree: () => void;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onBranchSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  runningSessionId: string | null;
  isAIProcessing: boolean;
  promptUiState: StateStore<PromptUiStateShape>;
};

export type PromptActivityAreaProps = {
  activeSession: AgentSession | null;
  onOpenSectionInTab: (section: 'changes' | 'reasoning') => void;
  isModelManagerOpen: boolean;
  selectedModelInfo: { id: string; name?: string };
  cachedModelIds: string[];
  onCloseModelManager: () => void;
  onModelCacheAction: (
    model: ModelOption,
    action: 'cache' | 'delete' | 'uncache',
  ) => void | Promise<void>;
  modelCacheWork: string | null;
  modelCacheProgress: string;
  modelCacheError: string;
  isModelDownloading: boolean;
  modelDownloadProgress: string;
  patchSession: (sessionId: string, patch: Partial<AgentSession>) => void;
  onClearAIModelLog: () => void;
};

export type PromptHeaderProps = {
  isAIProcessing: boolean;
  isSystemProcessing: boolean;
  mode?: string;
  onModeChange?: (mode: string) => void;
  copyContent?: string;
  latestManagerTrace?: ManagerTrace | null;
  traceFiles?: FileMap;
  onReplayRequest?: (request: string) => void;
};

export type SessionDialogState =
  | {
      type: 'rename';
      sessionId: string;
      value: string;
    }
  | {
      type: 'delete';
      sessionId: string;
      name: string;
      descendantCount?: number;
    }
  | {
      type: 'error';
      message: string;
    }
  | null;

export type PromptContentProps = {
  isMobile: boolean;
  isOpen: boolean;
  desktopWidth: string;
  header: PromptHeaderProps;
  session: PromptSessionAreaProps;
  activity: PromptActivityAreaProps;
  composer: PromptComposerProps;
  sessionReasoning: string;
};

export type UseAgentRunnerParams = {
  val: string;
  isAIProcessing: boolean;
  activeSession: AgentSession | null;
  agentSessionState: StateStore<AgentSessionStateShape> | null;
  promptUiState: StateStore<PromptUiStateShape>;
  promptScope: string;
  selectedModel: string;
  abortController: AbortController | null;
  runningSessionId: string | null;
  addToHistory: (prompt: string) => void;
  patchSession: (sessionId: string, patch: Partial<AgentSession>) => void;
  pushSessionMessage: (sessionId: string, message: AgentSessionMessage) => void;
  createSessionMessage: (message: {
    role: string;
    text: string;
    agentRole?: string | null;
  }) => AgentSessionMessage;
  fs: FileSystemApi;
  tabState: StateStore<TabStateShape>;
  editorState: StateStore<ExtendedEditorState>;
  sidebarState: StateStore<SidebarStateShape>;
  logState: StateStore<LogStateShape>;
  cachedModelIds?: string[];
  webLLMEngines?: Record<string, import('@/components/state/domain-types').WebLLMEngineState>;
};

export type AgentEventFormatter = (event: AgentEvent) => string;

export type UsePromptSessionControlsParams = {
  agentSessionState: StateStore<AgentSessionStateShape>;
  promptUiState: StateStore<PromptUiStateShape>;
  selectedModel: string;
  isAIProcessing: boolean;
};
