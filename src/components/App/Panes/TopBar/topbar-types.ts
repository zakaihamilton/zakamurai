import type {
  AgentSessionStateShape,
  AppStateShape,
  LogStateShape,
  NavigationHistory,
  PreviewStateShape,
  PromptStateShape,
  PromptUiStateShape,
  SidebarStateShape,
  TabStateShape,
} from '@/components/state/domain-types';
import type { StateStore } from '@/components/state/types';
export type ResetNewProjectStateParams = {
  template?: string;
  appState: StateStore<AppStateShape>;
  sidebarState: StateStore<SidebarStateShape>;
  tabState: StateStore<TabStateShape>;
  editorState: StateStore<import('@/components/App/Views/EditorArea/types').ExtendedEditorState>;
  previewState: StateStore<PreviewStateShape>;
  promptUiState?: StateStore<PromptUiStateShape> | null;
  promptState?: StateStore<PromptStateShape> | null;
  agentSessionState?: StateStore<AgentSessionStateShape> | null;
  logState?: StateStore<LogStateShape> | null;
  changeSetState?: StateStore<import('@/components/state/domain-types').ChangeSetStateShape> | null;
};

export type BreadcrumbProps = {
  breadcrumb: string[];
  onBreadcrumbClick: (segment: string, index: number) => void;
};

export type ActionButtonsProps = {
  onCompile: () => void;
  onRebuild: () => void | Promise<void>;
  onOpenLog: () => void;
  onOpenPreview: () => void;
  onToggleAIInput: () => void;
};

export type TopBarMenuProps = {
  onExportZip: () => void;
  onExportCompiledZip: () => void;
  onNewProject: (template?: string) => void | Promise<void>;
  onClearFS: () => void;
  onExportSupportReport: () => void;
  onToggleShortcuts: () => void;
};

export type HistoryDropdownProps = {
  isOpen: boolean;
  onClose: () => void;
  history: NavigationHistory;
  onItemClick: (index: number) => void;
  onClearHistory: () => void;
};
