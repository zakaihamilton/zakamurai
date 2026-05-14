import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes';
import { TabState } from '@/components/App/Panes';
import { PreviewState } from '@/components/App/PreviewState';
import { LogState } from '@/components/App/Views/LogArea';
import { Icons } from '@/components/Core/Base/Icons';
import { useNotification } from '@/components/Widgets/Notification/Notification';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { formatShortcut } from '@/utils/os';
import React from 'react';
import styles from './Dashboard.module.css';

const countFiles = (nodes = []) =>
  nodes.reduce((total, node) => {
    if (node.type === 'folder') return total + countFiles(node.children || []);
    return total + 1;
  }, 0);

export default function Dashboard() {
  const appState = AppState.useState();
  const sidebarState = SidebarState.useState();
  const tabState = TabState.useState();
  const previewState = PreviewState.useState();
  const logState = LogState.useState();
  const { addNotification } = useNotification();
  const { projectName, fs, isMobile } = appState;
  const { folderTree = [], showAIInput, isSidebarOpen, isSidebarPopupOpen } = sidebarState;
  const { openTabs = [] } = tabState;
  const { htmlContent, isCompilerReady } = previewState;
  const { isSystemProcessing, logs = [] } = logState;

  const fileCount = countFiles(folderTree);
  const hasLinkedFolder = fs?.mode === 'local';
  const visibleTabs = openTabs.slice(0, 4);
  const linkedLabel = hasLinkedFolder ? 'Linked folder' : 'Browser project';
  const previewLabel = htmlContent
    ? 'Preview ready'
    : isCompilerReady
      ? 'Compiler ready'
      : 'Compile needed';

  const handleCreateFile = () => {
    sidebarState((draft) => {
      if (isMobile) {
        draft.isSidebarPopupOpen = true;
        draft.isAIInputPopupOpen = false;
      } else {
        draft.isSidebarOpen = true;
      }
    });
    addNotification('Select a folder in the explorer to create a file', 'info');
  };

  const handleOpenFolder = () => {
    if (fs?.mountLocal) {
      fs.mountLocal();
    }
  };

  const handleCompile = () => {
    appState((draft) => {
      draft.compileRequest = (draft.compileRequest || 0) + 1;
    });
  };

  const handleOpenLog = () => {
    tabState((draft) => {
      const exists = draft.openTabs.some((t) => t.id === 'ai-logs');
      if (!exists) {
        draft.openTabs = [...draft.openTabs, { id: 'ai-logs', type: 'logs', label: 'Logs' }];
      }
      draft.activeTabId = 'ai-logs';
    });
  };

  const handleOpenPreview = () => {
    tabState((draft) => {
      const exists = draft.openTabs.some((t) => t.id === 'preview');
      if (!exists) {
        draft.openTabs = [...draft.openTabs, { id: 'preview', type: 'preview', label: 'Preview' }];
      }
      draft.activeTabId = 'preview';
    });
  };

  const handleToggleAI = () => {
    sidebarState((draft) => {
      if (isMobile) {
        draft.isAIInputPopupOpen = !draft.isAIInputPopupOpen;
        draft.isSidebarPopupOpen = false;
      } else {
        draft.showAIInput = !draft.showAIInput;
      }
    });
  };

  const handleShowInfo = () => {
    const exists = tabState.openTabs.some((t) => t.id === 'project-info');
    if (!exists) {
      tabState.openTabs = [
        ...tabState.openTabs,
        {
          id: 'project-info',
          type: 'project-info',
          label: 'Project Info',
        },
      ];
    }
    tabState.activeTabId = 'project-info';
  };

  const handleShowInstructions = () => {
    const exists = tabState.openTabs.some((t) => t.id === 'instructions');
    if (!exists) {
      tabState.openTabs = [
        ...tabState.openTabs,
        {
          id: 'instructions',
          type: 'instructions',
          label: 'Instructions',
        },
      ];
    }
    tabState.activeTabId = 'instructions';
  };

  const handleOpenTab = (tabId) => {
    tabState((draft) => {
      draft.activeTabId = tabId;
    });
  };

  const getTabIcon = (tab) => {
    if (tab.type === 'logs') return <Icons.Terminal />;
    if (tab.type === 'preview') return <Icons.Globe />;
    if (tab.type === 'project-info') return <Icons.Info />;
    if (tab.type === 'instructions') return <Icons.Info />;
    return <Icons.File />;
  };

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <div className={styles.brand}>
          <Icons.ZLogo size={36} className={styles.logo} />
          <div>
            <h1 className={styles.title}>{projectName || 'Zakamurai'}</h1>
            <p className={styles.subtitle}>{linkedLabel}</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Tooltip content="Project Information">
            <button
              type="button"
              className={styles.infoButton}
              onClick={handleShowInfo}
              aria-label="Show project information"
            >
              <Icons.Info size={18} />
            </button>
          </Tooltip>
          <Tooltip content="Instructions">
            <button
              type="button"
              className={styles.infoButton}
              onClick={handleShowInstructions}
              aria-label="Show instructions"
            >
              <Icons.Code size={18} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className={styles.statusGrid}>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>Files</span>
          <strong>{fileCount}</strong>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>Preview</span>
          <strong>{previewLabel}</strong>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>AI Panel</span>
          <strong>{showAIInput ? 'Open' : 'Closed'}</strong>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>Logs</span>
          <strong>{logs.length}</strong>
        </div>
      </div>

      <div className={styles.primaryActions}>
        <button type="button" className={styles.primaryButton} onClick={handleCompile}>
          <Icons.Play />
          <span>{isSystemProcessing ? 'Compiling...' : 'Compile'}</span>
          <kbd>{formatShortcut('⌘↵')}</kbd>
        </button>
        <button type="button" className={styles.iconAction} onClick={handleOpenPreview}>
          <Icons.Globe />
          <span>Preview</span>
        </button>
        <button type="button" className={styles.iconAction} onClick={handleOpenLog}>
          <Icons.Terminal />
          <span>Logs</span>
        </button>
        <button type="button" className={styles.iconAction} onClick={handleToggleAI}>
          <Icons.BotSmall />
          <span>{showAIInput ? 'Hide AI' : 'Ask AI'}</span>
        </button>
      </div>

      <div className={styles.grid}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>Workspace</h3>
            <span>{isSidebarOpen || isSidebarPopupOpen ? 'Explorer open' : 'Explorer closed'}</span>
          </div>
          <button type="button" className={styles.card} onClick={handleOpenFolder}>
            <Icons.FolderPlus />
            <div>
              <p className={styles.cardLabel}>
                {hasLinkedFolder ? 'Relink folder' : 'Open folder'}
              </p>
              <p className={styles.cardHint}>Work with files from your machine</p>
            </div>
          </button>
          <button
            type="button"
            className={styles.card}
            onClick={handleCreateFile}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCreateFile()}
          >
            <Icons.FilePlus />
            <div>
              <p className={styles.cardLabel}>Create a file</p>
              <p className={styles.cardHint}>Use the explorer on the left</p>
            </div>
          </button>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>Resume</h3>
            <span>{openTabs.length} open</span>
          </div>
          {visibleTabs.length > 0 ? (
            visibleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={styles.card}
                onClick={() => handleOpenTab(tab.id)}
              >
                {getTabIcon(tab)}
                <div>
                  <p className={styles.cardLabel}>{tab.label}</p>
                  <p className={styles.cardHint}>{tab.type === 'file' ? tab.id : 'Open tab'}</p>
                </div>
              </button>
            ))
          ) : (
            <div className={styles.emptyState}>
              <Icons.History />
              <p>No open tabs yet</p>
              <span>Open a file, preview, or logs to keep it close.</span>
            </div>
          )}
        </section>
      </div>

      <div className={styles.shortcuts}>
        <div className={styles.shortcut}>
          <span>Sidebar</span>
          <kbd>{formatShortcut('⌃B')}</kbd>
        </div>
        <div className={styles.shortcut}>
          <span>AI Panel</span>
          <kbd>{formatShortcut('⌃J')}</kbd>
        </div>
        <div className={styles.shortcut}>
          <span>Find File</span>
          <kbd>{formatShortcut('⌃P')}</kbd>
        </div>
        <button
          type="button"
          className={styles.shortcutsButton}
          onClick={() =>
            appState((draft) => {
              draft.showShortcuts = true;
            })
          }
        >
          View all shortcuts
        </button>
      </div>
    </div>
  );
}
