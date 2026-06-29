import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { PreviewState } from '@/components/App/PreviewState';
import { EditorState } from '@/components/App/Views/EditorArea';
import { LogState } from '@/components/App/Views/LogArea';
import {
  DEFAULT_CONTENTS,
  DEFAULT_FILES,
  SCRATCH_CONTENTS,
  SCRATCH_FILES,
} from '@/components/Storage/InitialData';
import Settings from '@/components/Storage/Settings';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { formatShortcut } from '@/utils/os';
import React from 'react';
import useProjectCompiler from './ProjectCompiler';
import styles from './TopBar.module.css';
import useZipExporter from './ZipExporter';
import ActionButtons from './subcomponents/ActionButtons';
import Breadcrumb from './subcomponents/Breadcrumb';
import NavigationControls from './subcomponents/NavigationControls';
import ThemeToggle from './subcomponents/ThemeToggle';
import TopBarMenu from './subcomponents/TopBarMenu';
import WorkingIndicator from './subcomponents/WorkingIndicator';

export function resetNewProjectState({
  template = 'default',
  appState,
  sidebarState,
  tabState,
  editorState,
  previewState,
}) {
  const isScratch = template === 'scratch';
  const initialFiles = isScratch ? SCRATCH_FILES : DEFAULT_FILES;
  const initialContents = isScratch ? SCRATCH_CONTENTS : DEFAULT_CONTENTS;

  appState((draft) => {
    draft.projectName = Settings.getProjectName();
  });
  sidebarState((draft) => {
    draft.folderTree = initialFiles;
    draft.expandedFolders = {};
  });
  tabState((draft) => {
    draft.openTabs = [];
    draft.activeTabId = null;
  });
  editorState((draft) => {
    draft.fileContents = initialContents;
    draft.pendingDiffs = {};
  });
  previewState((draft) => {
    draft.htmlContent = null;
  });
  Settings.setFileContents(initialContents);
}

export default function TopBar() {
  const appState = AppState.useState();
  const { projectName, fs, isMobile } = appState;
  const tabState = TabState.useState();
  const { openTabs = [], activeTabId } = tabState;
  const sidebarState = SidebarState.useState();
  const { folderTree, isSidebarOpen, isSidebarPopupOpen } = sidebarState;
  const editorState = EditorState.useState();
  const logState = LogState.usePassiveState();
  const previewState = PreviewState.usePassiveState();
  const { isSystemProcessing } = LogState.useState('isSystemProcessing');

  const { handleCompile, handleOpenLog, handleOpenPreview, handleClearFS } = useProjectCompiler(
    appState,
    tabState,
    sidebarState,
    editorState,
    logState,
    previewState,
    isSystemProcessing,
  );

  const { handleExportZip, handleExportCompiledZip } = useZipExporter(
    fs,
    editorState,
    folderTree,
    projectName,
  );

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const handleStartOver = async (template = 'default') => {
    await fs.unlinkProject();
    Settings.reset(template);
    resetNewProjectState({
      template,
      appState,
      sidebarState,
      tabState,
      editorState,
      previewState,
    });
    window.location.reload();
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

  const handleBreadcrumbClick = (_seg, index) => {
    sidebarState((draft) => {
      if (!draft.expandedFolders) draft.expandedFolders = {};

      let fullPath = '';
      if (index > 0) {
        const pathSegments = breadcrumb.slice(1, index + 1);
        fullPath = pathSegments.join('/');
      }

      const current = draft.expandedFolders[fullPath] !== false;
      draft.expandedFolders[fullPath] = !current;
    });
  };

  const isSidebarActive = isMobile ? isSidebarPopupOpen : isSidebarOpen;
  return (
    <header className={`${styles.header} ${isSidebarActive ? styles.sidebarOpen : ''}`}>
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

      <NavigationControls />

      <Breadcrumb breadcrumb={breadcrumb} onBreadcrumbClick={handleBreadcrumbClick} />
      <div className={styles.centerSection} />
      <div className={styles.actions}>
        <WorkingIndicator />
        <ActionButtons
          onCompile={handleCompile}
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
          onToggleShortcuts={() => {
            appState((draft) => {
              draft.showShortcuts = !draft.showShortcuts;
            });
          }}
        />
        <ThemeToggle />
      </div>
    </header>
  );
}
