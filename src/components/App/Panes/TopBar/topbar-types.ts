import type { StateStore } from 'triactor';
import type { ExtendedEditorState } from '@/components/App/Views/EditorArea/types';
import type {
  AgentSessionStateShape,
  AppStateShape,
  ChangeSetStateShape,
  LogStateShape,
  NavigationHistory,
  PendingDiff,
  PreviewStateShape,
  ProblemsStateShape,
  PromptStateShape,
  PromptUiStateShape,
  SidebarStateShape,
  TabStateShape,
  WorkspaceHealthStateShape,
} from '@/types/domain-types';
export type ResetNewProjectStateParams = {
  template?: string;
  projectName?: string;
  contents?: Record<string, string>;
  pendingDiffs?: Record<string, PendingDiff>;
  pendingDeletions?: ExtendedEditorState['pendingDeletions'];
  changeSets?: ChangeSetStateShape;
  appState: StateStore<AppStateShape>;
  sidebarState: StateStore<SidebarStateShape>;
  tabState: StateStore<TabStateShape>;
  editorState: StateStore<import('@/components/App/Views/EditorArea/types').ExtendedEditorState>;
  previewState: StateStore<PreviewStateShape>;
  promptUiState?: StateStore<PromptUiStateShape> | null;
  promptState?: StateStore<PromptStateShape> | null;
  agentSessionState?: StateStore<AgentSessionStateShape> | null;
  logState?: StateStore<LogStateShape> | null;
  changeSetState?: StateStore<import('@/types/domain-types').ChangeSetStateShape> | null;
  problemsState?: StateStore<ProblemsStateShape> | null;
  workspaceHealthState?: StateStore<WorkspaceHealthStateShape> | null;
};

export type BreadcrumbProps = {
  breadcrumb: string[];
  onBreadcrumbClick: (segment: string, index: number) => void;
};

export type ActionButtonsProps = {
  onCompile: () => void;
  onStopAI?: () => void;
  onRebuild: () => void | Promise<void>;
  onOpenLog: () => void;
  onOpenPreview: () => void;
  onToggleAIInput: () => void;
};

export type TopBarMenuProps = {
  onExportZip: () => void;
  onShareProject?: () => void;
  onExportCompiledZip: () => void;
  onNewProject: (template?: string) => void | Promise<void>;
  onOpenProjectLibrary?: () => void;
  projectActionRequest?: AppStateShape['projectActionRequest'];
  onConsumeProjectActionRequest?: () => void;
  onClearFS: () => void;
  onToggleShortcuts: () => void;
};

export type HistoryDropdownProps = {
  isOpen: boolean;
  onClose: () => void;
  history: NavigationHistory;
  onItemClick: (index: number) => void;
  onClearHistory: () => void;
};
