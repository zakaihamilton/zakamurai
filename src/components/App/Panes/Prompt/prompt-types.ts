import type { FileSystemApi } from '@/components/App/types';
import type { AgentEvent, RoleEdge, RoleGraph, RoleKind, RoleNode } from '@/components/AI/types';
import type { SelectOption } from '@/components/ui/types';
import type {
  AgentSession,
  AgentSessionMessage,
  AgentSessionStateShape,
  EditorStateShape,
  LogStateShape,
  PromptUiStateShape,
  SidebarStateShape,
  TabStateShape,
} from '@/components/state/domain-types';
import type { StateStore } from '@/components/state/types';
import type { ChangeEvent, FormEvent, KeyboardEvent, ReactNode } from 'react';

export type ModelOption = {
  id: string;
  label: string;
  ramMB?: number;
  storageMB?: number;
};

/** Select dropdown option derived from WEB_LLM_MODELS (value/label shape). */
export type ModelSelectOption = SelectOption;

export type RoleCardProps = {
  role: RoleNode;
  index: number;
  roleCount: number;
  kindOptions: SelectOption[];
  modelOptions?: SelectOption[];
  defaultModelId?: string;
  rejectEdge?: RoleEdge | null;
  otherRoles?: RoleNode[];
  disabled?: boolean;
  onUpdateLabel?: (label: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
  onChangeKind?: (kind: RoleKind | string, label: string) => void;
  onChangeModel?: (modelId: string | null) => void;
  onChangeSystemPrompt?: (systemPrompt: string | null) => void;
  onChangeRejectTarget?: (toId: string | null, maxTimes: number) => void;
  onChangeRejectMaxTimes?: (maxTimes: number) => void;
  onChangeJoin?: (join: 'all' | 'any' | string) => void;
  onChangeMaxRetries?: (maxRetries: number) => void;
};

export type RoleGraphAddRowProps = {
  kindOptions?: SelectOption[];
  disabled?: boolean;
  onAdd?: (kind: RoleKind | string) => void;
};

export type RoleGraphEditorProps = {
  roleGraph?: RoleGraph | null;
  modelOptions?: SelectOption[];
  defaultModelId?: string;
  disabled?: boolean;
  onChange?: (graph: RoleGraph) => void;
  showTitle?: boolean;
};

export type RoleGraphDialogProps = {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm?: () => void;
  roleGraph?: RoleGraph | null;
  modelOptions?: SelectOption[];
  defaultModelId?: string;
  disabled?: boolean;
  onChange?: (graph: RoleGraph) => void;
};

export type RoleGraphHeaderProps = {
  showTitle?: boolean;
  disabled?: boolean;
  onReset?: () => void;
  onAddCustom?: () => void;
};

export type RoleGraphSummaryProps = {
  roleGraph?: RoleGraph | null;
  disabled?: boolean;
  onEdit?: () => void;
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

export type PromptContextPanelProps = {
  scope?: string;
  onScopeChange?: (scope: string) => void;
  activeFileName?: string;
  activeFilePath?: string;
  selectedLines: number[];
  selectedLineText: string;
  runState: string;
};

export type PromptHeaderProps = {
  isAIProcessing: boolean;
  isSystemProcessing: boolean;
  hasReasoning: boolean;
  isReasoningVisible: boolean;
  onToggleReasoning: () => void;
  mode?: string;
  onModeChange?: (mode: string) => void;
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
  desktopWidth: number;
  isAIProcessing: boolean;
  isSystemProcessing: boolean;
  activeSession: AgentSession | null;
  sessionReasoning: string;
  isReasoningVisible: boolean;
  onToggleReasoning: () => void;
  onModeChange: (mode: string) => void;
  onOpenTree: () => void;
  isAgentTreeOpen: boolean;
  sessionDialog: SessionDialogState;
  agentSessionState: AgentSessionStateShape | null;
  onCloseTree: () => void;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: (name: string) => void;
  onBranchSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, name: string) => void;
  onDeleteSession: (sessionId: string) => void;
  runningSessionId: string | null;
  promptUiState: StateStore<PromptUiStateShape>;
  isRoleGraphOpen: boolean;
  onOpenRoleGraph: () => void;
  onCloseRoleGraph: () => void;
  modelOptions: ModelSelectOption[];
  selectedModel: string;
  promptScope: string;
  onScopeChange: (scope: string) => void;
  activeFileName?: string;
  activeFilePath?: string;
  selectedLines: number[];
  selectedLineText: string;
  runState: string;
  isModelManagerOpen: boolean;
  selectedModelInfo: { id: string; name?: string };
  cachedModelIds: string[];
  onCloseModelManager: () => void;
  onModelCacheAction: (action: string, modelId?: string) => void;
  modelCacheWork: unknown;
  modelCacheProgress: string;
  modelCacheError: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStop: (event: React.MouseEvent<HTMLButtonElement>) => void;
  isButtonActive: boolean;
  onChangeModel: (modelId: string) => void;
  onLoadCachedModelIds: () => void;
  onOpenModelManager: () => void;
  patchSession: (sessionId: string, patch: Partial<AgentSession>) => void;
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
  editorState: StateStore<EditorStateShape>;
  sidebarState: StateStore<SidebarStateShape>;
  logState: StateStore<LogStateShape>;
};

export type AgentEventFormatter = (
  event: AgentEvent,
  roleLabelById?: Record<string, string>,
) => string;

export type UsePromptSessionControlsParams = {
  agentSessionState: StateStore<AgentSessionStateShape>;
  promptUiState: StateStore<PromptUiStateShape>;
  selectedModel: string;
  isAIProcessing: boolean;
  isRoleGraphOpen: boolean;
};

