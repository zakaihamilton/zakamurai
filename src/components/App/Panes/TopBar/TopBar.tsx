import { computeDiff } from '@/components/AI/Processor/utils/DiffEngine';
import { AppState } from '@/components/App/AppState';
import {
  AgentSessionState,
  createDefaultAgentSessions,
} from '@/components/App/Panes/Prompt/AgentSessions';
import { PromptState, PromptUiState } from '@/components/App/Panes/Prompt/PromptState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { buildTreeFromPaths } from '@/components/App/Panes/Sidebar/TreeUtils';
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
import { normalizePendingDeletions } from '@/components/Storage/SettingsSerialization';
import { STORAGE_RECOVERY_EVENT } from '@/components/Storage/StorageHealth';
import { StorageHealthState } from '@/components/Storage/StorageHealth';
import { ChangeSetState } from '@/components/Workspace';
import { setInDraft } from '@/components/state/StateUtils';
import type { PendingDiff, Tab } from '@/components/state/domain-types';
import Dialog from '@/components/ui/Dialog';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { createWorkspaceSnapshot } from '@/contracts/workspace';
import { formatShortcut } from '@/utils/os';
import { useEffect, useState } from 'react';
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
  const [checkpointSavedAt, setCheckpointSavedAt] = useState<number | null>(
    Settings.getRecoveryCheckpoint?.()?.savedAt || null,
  );

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

  const handleSaveCheckpoint = async () => {
    const checkpoint = createWorkspaceSnapshot({
      reason: 'manual',
      projectName,
      fileContents: { ...(editorState.fileContents || {}) },
      pendingDiffs: { ...(editorState.pendingDiffs || {}) },
      pendingDeletions: { ...(editorState.pendingDeletions || {}) },
      openTabs: [...(tabState.openTabs || [])],
      activeTabId: tabState.activeTabId || null,
    });
    const saved = await Settings.saveRecoveryCheckpoint(checkpoint);
    const availableForSession = Boolean(Settings.getRecoveryCheckpoint?.());
    if (saved || availableForSession) setCheckpointSavedAt(Date.now());
    logState?.((draft) => {
      draft.logs = [
        ...draft.logs,
        {
          id: Date.now(),
          role: 'system',
          text: saved
            ? 'Workspace checkpoint saved.'
            : availableForSession
              ? 'Workspace checkpoint saved for this session; durable storage is unavailable.'
              : 'Workspace checkpoint could not be saved.',
          timestamp: new Date().toTimeString().split(' ')[0],
        },
      ];
    });
  };

  const handleRestoreCheckpoint = async (checkpointId?: string | null) => {
    const checkpoint =
      (checkpointId
        ? Settings.getRecoveryCheckpoints?.().find(
            (item) => item.id === checkpointId || String(item.savedAt) === checkpointId,
          )
        : null) || Settings.getRecoveryCheckpoint?.();
    if (!checkpoint) return;
    const pendingDiffs = Object.fromEntries(
      Object.entries(checkpoint.pendingDiffs || {}).flatMap(([path, value]) => {
        const candidate = value as Partial<PendingDiff>;
        if (typeof candidate.originalContent !== 'string') return [];
        const modifiedContent =
          typeof candidate.modifiedContent === 'string'
            ? candidate.modifiedContent
            : checkpoint.fileContents[path] || '';
        return [
          [
            path,
            {
              ...candidate,
              originalContent: candidate.originalContent,
              modifiedContent,
              diffs: computeDiff(candidate.originalContent, modifiedContent).diffs,
            },
          ],
        ];
      }),
    ) as Record<string, PendingDiff>;
    const tabs = (Array.isArray(checkpoint.openTabs) ? checkpoint.openTabs : []) as Tab[];
    const contents = { ...(checkpoint.fileContents || {}) };
    appState((draft) => {
      draft.projectName = checkpoint.projectName || draft.projectName;
      draft.compileRequest += 1;
    });
    editorState((draft) => {
      draft.fileContents = contents;
      draft.pendingDiffs = pendingDiffs;
      draft.pendingDeletions = (checkpoint.pendingDeletions || {}) as typeof draft.pendingDeletions;
    });
    sidebarState((draft) => {
      draft.folderTree = buildTreeFromPaths(Object.keys(contents));
    });
    tabState((draft) => {
      draft.openTabs = tabs;
      draft.activeTabId = checkpoint.activeTabId;
    });
    previewState((draft) => {
      draft.htmlContent = null;
      draft.restoreError = null;
    });
    await Settings.setFileContents(contents);
    await Settings.setPendingDiffs(pendingDiffs);
    await Settings.setPendingDeletions(normalizePendingDeletions(checkpoint.pendingDeletions));
    setCheckpointSavedAt(checkpoint.savedAt);
    logState?.((draft) => {
      draft.logs = [
        ...draft.logs,
        {
          id: Date.now(),
          role: 'system',
          text: 'Workspace checkpoint restored. Rebuilding project…',
          timestamp: new Date().toTimeString().split(' ')[0],
        },
      ];
    });
  };

  useEffect(() => {
    window.addEventListener(STORAGE_RECOVERY_EVENT, handleExportZip);
    return () => window.removeEventListener(STORAGE_RECOVERY_EVENT, handleExportZip);
  }, [handleExportZip]);

  const activeTab = openTabs.find((t) => t.id === activeTabId);
  const checkpointHistory = Settings.getRecoveryCheckpoints?.() || [];

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
          onSaveCheckpoint={handleSaveCheckpoint}
          onRestoreCheckpoint={handleRestoreCheckpoint}
          hasCheckpoint={
            checkpointHistory.length > 0 ||
            Boolean(Settings.getRecoveryCheckpoint?.()) ||
            checkpointSavedAt !== null
          }
          checkpointHistory={checkpointHistory}
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
