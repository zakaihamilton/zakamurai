import { useEffect, useState } from 'react';
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
import { useFileSystem } from '@/components/Storage';
import {
  getProjectTemplate,
  getTemplateContents,
  getTemplateFiles,
  SCRATCH_CONTENTS,
  SCRATCH_FILES,
} from '@/components/Storage/InitialData';
import {
  deleteSavedProject,
  type SavedProject,
  saveProject,
} from '@/components/Storage/ProjectLibrary';
import Settings from '@/components/Storage/Settings';
import { STORAGE_RECOVERY_EVENT } from '@/components/Storage/StorageHealth';
import Dialog from '@/components/ui/Dialog';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import {
  ChangeSetState,
  DEFAULT_WORKSPACE_HEALTH,
  ProblemsState,
  WorkspaceHealthState,
} from '@/components/Workspace';
import { formatShortcut } from '@/utils/os';
import { setInDraft } from '@/utils/StateUtils';
import { requireStore } from '../../types';
import { createEffectiveFileContentsSnapshot } from '../../Views/EditorArea/EditorBuffers';
import { buildTreeFromPaths } from '../Sidebar/TreeUtils';
import ActionButtons from './ActionButtons';
import Breadcrumb from './Breadcrumb';
import TopBarMenu from './Menu';
import NavigationControls from './NavigationControls';
import useProjectCompiler from './ProjectCompiler';
import ProjectLibraryDialog from './ProjectLibraryDialog';
import ThemeToggle from './ThemeToggle';
import styles from './TopBar.module.css';
import type { ResetNewProjectStateParams } from './topbar-types';
import WorkingIndicator from './WorkingIndicator';
import useZipExporter from './ZipExporter';

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
  problemsState,
  workspaceHealthState,
  projectName,
  contents,
  pendingDiffs,
  pendingDeletions,
  changeSets,
}: ResetNewProjectStateParams) {
  const initialContents =
    contents || (template === 'scratch' ? SCRATCH_CONTENTS : getTemplateContents(template));
  const initialFiles = contents
    ? buildTreeFromPaths(Object.keys(initialContents))
    : template === 'scratch'
      ? SCRATCH_FILES
      : getTemplateFiles(template);

  appState((draft) => {
    draft.projectName = projectName || Settings.getProjectName() || '';
    draft.workspaceEpoch = (draft.workspaceEpoch || 0) + 1;
  });
  sidebarState((draft) => {
    draft.folderTree = initialFiles as import('@/types/domain-types').TreeNode[];
    draft.expandedFolders = {};
    draft.draggedItem = null;
  });
  tabState((draft) => {
    draft.openTabs = [];
    draft.activeTabId = null;
    draft.lastCodeTabId = null;
  });
  editorState((draft) => {
    draft.fileContents = initialContents;
    draft.dirtyBufferContents = {};
    draft.pendingDiffs = pendingDiffs || {};
    draft.pendingDeletions = pendingDeletions || {};
    draft.navigationHistory = { stack: [], currentIndex: -1 };
    draft.shouldScrollTo = null;
    draft.history = {};
    draft.cursorPos = {};
    draft.selectedLines = {};
    draft.isCompleting = {};
    draft.completionActivity = {};
    draft.aiCompletionDebug = undefined;
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
    draft.stopRequest = 0;
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
    draft.activeId = changeSets?.activeId || null;
    draft.items = changeSets?.items || [];
  });
  problemsState?.((draft) => {
    draft.items = [];
  });
  workspaceHealthState?.((draft) => {
    Object.assign(draft, DEFAULT_WORKSPACE_HEALTH);
  });
  previewState((draft) => {
    draft.htmlContent = null;
    draft.isCompilerReady = false;
    draft.previewAddress = '/preview/dist/index.html';
    draft.previewSessionId = null;
    draft.containerStatus = 'idle';
    draft.compileStatus = 'idle';
    draft.compilePhase = null;
    draft.lastCompileAt = null;
    draft.containerError = null;
    draft.restoreError = null;
    draft.compileError = null;
    draft.compileDiagnostic = undefined;
    draft.serverError = null;
  });
}

export default function TopBar() {
  const appState = requireStore(
    AppState.useState(['projectName', 'isMobile', 'theme', 'projectActionRequest']),
  );
  const { projectName, isMobile } = appState;
  const fs = useFileSystem();
  const tabState = requireStore(TabState.useState(['openTabs', 'activeTabId']));
  const { openTabs = [], activeTabId } = tabState;
  const sidebarState = requireStore(SidebarState.useState(['isSidebarOpen', 'isSidebarPopupOpen']));
  const { isSidebarOpen, isSidebarPopupOpen } = sidebarState;
  const editorState = requireStore(EditorState.useState());
  const changeSetState = ChangeSetState.usePassiveState();
  const previewState = requireStore(PreviewState.useState());
  const promptUiState = PromptUiState.usePassiveState();
  const promptState = PromptState.usePassiveState();
  const agentSessionState = AgentSessionState.usePassiveState();
  const logState = LogState.usePassiveState();
  const problemsState = ProblemsState.usePassiveState();
  const workspaceHealthState = WorkspaceHealthState.usePassiveState();
  const [isProjectLibraryOpen, setProjectLibraryOpen] = useState(false);

  const { handleCompile, handleRebuild, handleOpenLog, handleOpenPreview, handleClearFS } =
    useProjectCompiler();
  const {
    handleExportZip,
    handleShareProject,
    handleExportCompiledZip,
    exportError,
    clearExportError,
  } = useZipExporter();

  useEffect(() => {
    window.addEventListener(STORAGE_RECOVERY_EVENT, handleExportZip);
    return () => window.removeEventListener(STORAGE_RECOVERY_EVENT, handleExportZip);
  }, [handleExportZip]);

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const handleOpenProgress = () => {
    const id = 'ai-section:reasoning';
    tabState((draft) => {
      if (!draft.openTabs.some((tab) => tab.id === id)) {
        draft.openTabs = [
          ...draft.openTabs,
          { id, type: 'ai-section', label: 'Progress & Reasoning', viewType: 'visual' },
        ];
      }
      draft.activeTabId = id;
    });
  };

  const handleStartOver = async (template = 'scratch') => {
    if (logState?.isSystemProcessing || logState?.isAIProcessing) return;
    appState((draft) => {
      draft.workspaceEpoch = (draft.workspaceEpoch || 0) + 1;
    });
    promptUiState?.abortController?.abort();
    const projectTemplate = getProjectTemplate(template);
    const initialContents = getTemplateContents(template);
    await fs.unlinkProject();
    Settings.pauseEditorBufferWrites();
    try {
      await Settings.reset(template, {
        preserveTheme: appState.theme,
        preserveAIPromptModel: promptUiState?.selectedModel,
        preserveWelcomePrompt: promptUiState?.welcomePrompt,
      });
      // Persist the selected starter before any background sync can observe the reset state.
      await Settings.setFileContents(initialContents);
      await Settings.setPendingDiffs({});
      await Settings.setPendingDeletions({});
      await Settings.setChangeSets({ activeId: null, items: [] });
      await Settings.setPreviewHtml(null);
      Settings.setProjectName(projectTemplate.name);
      resetNewProjectState({
        template,
        projectName: projectTemplate.name,
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
        problemsState,
        workspaceHealthState,
      });
    } finally {
      Settings.resumeEditorBufferWrites();
    }
  };

  const handleSaveProject = async (name: string) => {
    if (fs.mode === 'local') {
      throw new Error('Disconnect the local folder before saving a browser project copy.');
    }
    const record = await saveProject({
      id: Settings.getActiveLibraryProjectId(),
      name,
      templateId: Settings.getTemplate() || 'default',
      contents: createEffectiveFileContentsSnapshot(editorState),
      pendingDiffs: { ...(editorState.pendingDiffs || {}) },
      pendingDeletions: { ...(editorState.pendingDeletions || {}) },
      changeSets: {
        activeId: changeSetState?.activeId || null,
        items: changeSetState?.items || [],
      },
    });
    Settings.setActiveLibraryProjectId(record.id);
    Settings.setProjectName(record.name);
    appState((draft) => {
      draft.projectName = record.name;
    });
    return record;
  };

  const handleDeleteSavedProject = async (project: SavedProject) => {
    await deleteSavedProject(project.id);
    if (Settings.getActiveLibraryProjectId() === project.id) {
      Settings.setActiveLibraryProjectId(null);
    }
  };

  const handleOpenSavedProject = async (project: SavedProject) => {
    if (logState?.isSystemProcessing || logState?.isAIProcessing) {
      throw new Error(
        'Wait for the current build or AI request to finish before switching projects.',
      );
    }
    if (fs.mode === 'local') {
      throw new Error('Disconnect the local folder before opening a browser library project.');
    }
    appState((draft) => {
      draft.workspaceEpoch = (draft.workspaceEpoch || 0) + 1;
    });
    promptUiState?.abortController?.abort();
    await fs.unlinkProject();
    Settings.pauseEditorBufferWrites();
    try {
      await Settings.reset(project.templateId, {
        preserveTheme: appState.theme,
        preserveAIPromptModel: promptUiState?.selectedModel,
        preserveWelcomePrompt: promptUiState?.welcomePrompt,
      });
      Settings.setProjectName(project.name);
      Settings.setActiveLibraryProjectId(project.id);
      await Promise.all([
        Settings.setFileContents(project.contents),
        Settings.setPendingDiffs(project.pendingDiffs),
        Settings.setPendingDeletions(project.pendingDeletions),
        Settings.setChangeSets(project.changeSets),
        Settings.setPreviewHtml(null),
      ]);
      resetNewProjectState({
        template: project.templateId,
        projectName: project.name,
        contents: project.contents,
        pendingDiffs: project.pendingDiffs,
        pendingDeletions: project.pendingDeletions,
        changeSets: project.changeSets,
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
        problemsState,
        workspaceHealthState,
      });
    } finally {
      Settings.resumeEditorBufferWrites();
    }
  };

  let breadcrumb = ['Welcome'];
  if (activeTab) {
    if (activeTab.type === 'file') {
      breadcrumb = [projectName, ...(activeTab.file?.path || [])];
    } else if (activeTab.type === 'logs') {
      breadcrumb = ['Log'];
    } else if (activeTab.type === 'preview') {
      breadcrumb = [projectName, 'dist', 'index.html'];
    } else if (activeTab.type === 'start-options') {
      breadcrumb = ['Choose a starting point'];
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
      <div className={styles.menuToggle}>
        <Tooltip
          content={isSidebarActive ? 'Collapse Sidebar' : 'Expand Sidebar'}
          shortcut={formatShortcut('⌃B')}
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
            <Icons.ZLogo size={isMobile ? 28 : 32} />
          </button>
        </Tooltip>
        <span className={styles.brandTitle} aria-hidden="true">
          ZAKAMUR<span className={styles.aiHighlight}>AI</span>
        </span>
      </div>

      <div className={styles.workingIndicator}>
        <WorkingIndicator onOpenProgress={handleOpenProgress} />
      </div>

      <NavigationControls />

      <Breadcrumb breadcrumb={breadcrumb} onBreadcrumbClick={handleBreadcrumbClick} />
      <div className={styles.centerSection} />
      <div className={styles.actions}>
        <ActionButtons
          onCompile={handleCompile}
          onStopAI={() =>
            promptUiState?.((draft) => {
              draft.stopRequest = (draft.stopRequest || 0) + 1;
            })
          }
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
          onShareProject={handleShareProject}
          onExportCompiledZip={handleExportCompiledZip}
          onNewProject={handleStartOver}
          onOpenProjectLibrary={() => setProjectLibraryOpen(true)}
          projectActionRequest={appState.projectActionRequest}
          onConsumeProjectActionRequest={() =>
            appState((draft) => {
              draft.projectActionRequest = null;
            })
          }
          onClearFS={handleClearFS}
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
      <ProjectLibraryDialog
        isOpen={isProjectLibraryOpen}
        currentProjectName={projectName}
        activeProjectId={Settings.getActiveLibraryProjectId()}
        canSave={fs.mode !== 'local'}
        onClose={() => setProjectLibraryOpen(false)}
        onSave={handleSaveProject}
        onOpen={handleOpenSavedProject}
        onDelete={handleDeleteSavedProject}
      />
    </header>
  );
}
