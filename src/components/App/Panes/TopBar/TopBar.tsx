import { AppState } from '@/components/App/AppState';
import {
  AgentSessionState,
  createDefaultAgentSessions,
} from '@/components/App/Panes/Prompt/AgentSessions';
import { PromptState, PromptUiState } from '@/components/App/Panes/Prompt/PromptState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { PreviewState } from '@/components/App/PreviewState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import {
  DiagnosticsState,
  createSupportReport,
  downloadSupportReport,
} from '@/components/Diagnostics';
import { useFileSystem } from '@/components/Storage';
import {
  DEFAULT_CONTENTS,
  DEFAULT_FILES,
  SCRATCH_CONTENTS,
  SCRATCH_FILES,
} from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';
import { STORAGE_RECOVERY_EVENT } from '@/components/Storage/StorageHealth';
import { StorageHealthState } from '@/components/Storage/StorageHealth';
import { ChangeSetState } from '@/components/Workspace';
import { setInDraft } from '@/components/state/StateUtils';
import Dialog from '@/components/ui/Dialog';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { formatShortcut } from '@/utils/os';
import { useEffect } from 'react';
import { requireStore } from '../../types';
import ActionButtons from './ActionButtons';
import Breadcrumb from './Breadcrumb';
import TopBarMenu from './Menu';
import NavigationControls from './NavigationControls';
import useProjectCompiler from './ProjectCompiler';
import ThemeToggle from './ThemeToggle';
import styles from './TopBar.module.css';
import WorkingIndicator from './WorkingIndicator';
import useZipExporter from './ZipExporter';
import type { ResetNewProjectStateParams } from './topbar-types';

export function resetNewProjectState({
  template = 'default',
  appState,
  sidebarState,
  tabState,
  editorState,
  previewState,
  promptUiState,
  promptState,
  agentSessionState,
  logState,
  changeSetState,
}: ResetNewProjectStateParams) {
  const isScratch = template === 'scratch';
  const initialFiles = isScratch ? SCRATCH_FILES : DEFAULT_FILES;
  const initialContents = isScratch ? SCRATCH_CONTENTS : DEFAULT_CONTENTS;

  appState((draft) => {
    draft.projectName = Settings.getProjectName() || '';
  });
  sidebarState((draft) => {
    draft.folderTree = initialFiles as import('@/components/state/domain-types').TreeNode[];
    draft.expandedFolders = {};
  });
  tabState((draft) => {
    draft.openTabs = [];
    draft.activeTabId = null;
  });
  editorState((draft) => {
    draft.fileContents = initialContents;
    draft.pendingDiffs = {};
    draft.pendingDeletions = {};
  });
  promptState?.((draft) => {
    draft.promptHistory = [];
  });
  agentSessionState?.((draft) => {
    const next = createDefaultAgentSessions(promptUiState?.selectedModel || null);
    draft.sessions = next.sessions;
    draft.activeSessionId = next.activeSessionId;
  });
  logState?.((draft) => {
    draft.isSystemProcessing = false;
    draft.isAIProcessing = false;
    draft.logs = [];
    draft.reasoning = '';
  });
  promptUiState?.((draft) => {
    draft.val = '';
    draft.draftVal = '';
    draft.historyIndex = -1;
    draft.welcomeRequest = null;
    draft.runningSessionId = null;
    draft.isAgentTreeOpen = false;
    draft.sessionDialog = null;
    draft.isModelManagerOpen = false;
    draft.modelCacheWork = null;
    draft.modelCacheProgress = '';
    draft.modelCacheError = '';
    draft.abortController = null;
    draft.latestManagerTrace = null;
    draft.latestAIIncident = null;
  });
  changeSetState?.((draft) => {
    draft.activeId = null;
    draft.items = [];
  });
  previewState((draft) => {
    draft.htmlContent = null;
  });
}

export default function TopBar() {
  const appState = requireStore(AppState.useState(['projectName', 'isMobile', 'theme']));
  const { projectName, isMobile } = appState;
  const fs = useFileSystem();
  const tabState = requireStore(TabState.useState(['openTabs', 'activeTabId']));
  const { openTabs = [], activeTabId } = tabState;
  const sidebarState = requireStore(SidebarState.useState(['isSidebarOpen', 'isSidebarPopupOpen']));
  const { isSidebarOpen, isSidebarPopupOpen } = sidebarState;
  const editorState = requireStore(EditorState.useState());
  const changeSetState = ChangeSetState.usePassiveState();
  const previewState = requireStore(PreviewState.useState());
  const promptUiState = PromptUiState.useState(['latestAIIncident']);
  const promptState = PromptState.usePassiveState();
  const agentSessionState = AgentSessionState.usePassiveState();
  const diagnosticsState = DiagnosticsState.usePassiveState();
  const storageHealthState = StorageHealthState.usePassiveState();
  const logState = LogState.usePassiveState();

  const { handleCompile, handleRebuild, handleOpenLog, handleOpenPreview, handleClearFS } =
    useProjectCompiler();
  const { handleExportZip, handleExportCompiledZip, exportError, clearExportError } =
    useZipExporter();

  const handleExportSupportReport = () => {
    downloadSupportReport(
      createSupportReport({
        diagnostics: diagnosticsState?.events || [],
        logs: logState?.logs || [],
        storageHealth: (storageHealthState || {}) as Record<string, unknown>,
      }),
    );
  };

  const handleExportAIIncident = async () => {
    if (!promptUiState?.latestAIIncident) return;
    const { downloadAIIncident } = await import(
      /* webpackChunkName: "ai-incident" */ '@/components/AI/Agent/AIIncident'
    );
    downloadAIIncident(promptUiState.latestAIIncident);
  };

  useEffect(() => {
    window.addEventListener(STORAGE_RECOVERY_EVENT, handleExportZip);
    return () => window.removeEventListener(STORAGE_RECOVERY_EVENT, handleExportZip);
  }, [handleExportZip]);

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const handleStartOver = async (template = 'default') => {
    const initialContents = template === 'scratch' ? SCRATCH_CONTENTS : DEFAULT_CONTENTS;
    await fs.unlinkProject();
    await Settings.reset(template, {
      preserveTheme: appState.theme,
      preserveAIPromptModel: promptUiState?.selectedModel,
      preserveWelcomePrompt: promptUiState?.welcomePrompt,
    });
    // Persist the selected starter before any background sync can observe the reset state.
    await Settings.setFileContents(initialContents);
    await Settings.setPendingDiffs({});
    await Settings.setPreviewHtml(null);
    resetNewProjectState({
      template,
      appState,
      sidebarState,
      tabState,
      editorState,
      previewState,
      promptUiState,
      promptState,
      agentSessionState,
      logState,
      changeSetState,
    });
  };

  let breadcrumb = ['Welcome'];
  if (activeTab) {
    if (activeTab.type === 'file') {
      breadcrumb = [projectName, ...(activeTab.file?.path || [])];
    } else if (activeTab.type === 'logs') {
      breadcrumb = ['Log'];
    } else if (activeTab.type === 'preview') {
      breadcrumb = [projectName, 'dist', 'index.html'];
    }
  }

  const handleBreadcrumbClick = (_seg: string, index: number) => {
    sidebarState((draft) => {
      let fullPath = '';
      if (index > 0) {
        const pathSegments = breadcrumb.slice(1, index + 1);
        fullPath = pathSegments.join('/');
      }

      const current = draft.expandedFolders?.[fullPath] !== false;
      setInDraft(draft, ['expandedFolders', fullPath], !current);
    });
  };

  const isSidebarActive = isMobile ? isSidebarPopupOpen : isSidebarOpen;
  return (
    <header className={styles.header}>
      <Tooltip
        content={isSidebarActive ? 'Collapse Sidebar' : 'Expand Sidebar'}
        shortcut={formatShortcut('⌃B')}
        className={styles.menuToggle}
      >
        <button
          type="button"
          onClick={() =>
            sidebarState((draft) => {
              if (isMobile) {
                draft.isSidebarPopupOpen = !draft.isSidebarPopupOpen;
                draft.isAIInputPopupOpen = false;
              } else {
                draft.isSidebarOpen = !draft.isSidebarOpen;
              }
            })
          }
          aria-label={isSidebarActive ? 'Collapse Sidebar' : 'Expand Sidebar'}
          data-testid="sidebar-toggle"
        >
          <Icons.ZLogo size={32} />
          <span className={styles.brandTitle}>
            ZAKAMUR<span className={styles.aiHighlight}>AI</span>
          </span>
        </button>
      </Tooltip>

      <div className={styles.workingIndicator}>
        <WorkingIndicator />
      </div>

      <NavigationControls />

      <Breadcrumb breadcrumb={breadcrumb} onBreadcrumbClick={handleBreadcrumbClick} />
      <div className={styles.centerSection} />
      <div className={styles.actions}>
        <ActionButtons
          onCompile={handleCompile}
          onRebuild={handleRebuild}
          onOpenLog={handleOpenLog}
          onOpenPreview={handleOpenPreview}
          onToggleAIInput={() =>
            sidebarState((draft) => {
              if (isMobile) {
                draft.isAIInputPopupOpen = !draft.isAIInputPopupOpen;
                draft.isSidebarPopupOpen = false;
              } else {
                draft.showAIInput = !draft.showAIInput;
              }
            })
          }
        />
        <TopBarMenu
          onExportZip={handleExportZip}
          onExportCompiledZip={handleExportCompiledZip}
          onNewProject={handleStartOver}
          onClearFS={handleClearFS}
          onExportSupportReport={handleExportSupportReport}
          onExportAIIncident={handleExportAIIncident}
          hasAIIncident={Boolean(promptUiState?.latestAIIncident)}
          onToggleShortcuts={() => {
            appState((draft) => {
              draft.showShortcuts = !draft.showShortcuts;
            });
          }}
        />
        <ThemeToggle />
      </div>
      <Dialog
        isOpen={!!exportError}
        title="Unable to export compiled files"
        message={exportError}
        confirmText="OK"
        onConfirm={clearExportError}
        onCancel={clearExportError}
      />
    </header>
  );
}
