import React, { useState } from 'react';
import { Compiler } from '../../../utils/compiler';
import { ZipWriter } from '../../../utils/zip';
import Settings from '../../Storage/Settings';
import Dialog from '../../Widgets/Dialog/Dialog';
import Tooltip from '../../Widgets/Tooltip/Tooltip';
import { AppState, PreviewState } from '../App';
import { EditorState } from '../EditorArea';
import { Icons } from '../Icons';
import { LogState } from '../LogArea';
import { SidebarState } from '../Sidebar';
import { TabState } from '../TabBar';
import ContextMenu from '../../Widgets/ContextMenu/ContextMenu';
import styles from './TopBar.module.css';

export default function TopBar() {
  const appState = AppState.useState();
  const { theme, projectName, fs } = appState;
  const tabState = TabState.useState();
  const { openTabs = [], activeTabId } = tabState;
  const sidebarState = SidebarState.useState();
  const { folderTree } = sidebarState;
  const editorState = EditorState.useState();
  const logState = LogState.useState();
  const previewState = PreviewState.useState();
  const { isProcessing } = logState;
  const [isStartOverDialogOpen, setIsStartOverDialogOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const handleCompile = async () => {
    if (isProcessing) return;

    logState((draft) => {
      draft.isProcessing = true;
      draft.processingType = 'system';
    });
    // Switch to (and open) logs tab if not already there
    if (activeTabId !== 'ai-logs') {
      handleOpenLog();
    }

    const onLog = (text) => {
      logState((draft) => {
        draft.logs.push({ id: `${Date.now()}-${Math.random()}`, role: 'system', text });
      });
    };

    try {
      const compiler = new Compiler(onLog);
      await compiler.compile(fs, folderTree, editorState.fileContents);

      // After compilation, try to read dist/index.html from the VFS and store it in PreviewState
      try {
        const container = compiler.container;
        if (container?.vfs?.existsSync('/dist/index.html')) {
          const html = container.vfs.readFileSync('/dist/index.html', 'utf8');
          if (html) {
            previewState((draft) => {
              draft.htmlContent = html;
            });
            Settings.setPreviewHtml(html);
            // Open (or switch to) the preview tab
            tabState((draft) => {
              const exists = draft.openTabs.some((t) => t.id === 'preview');
              if (!exists) {
                draft.openTabs = [
                  ...draft.openTabs,
                  { id: 'preview', type: 'preview', label: 'Preview' },
                ];
              }
              draft.activeTabId = 'preview';
            });
            onLog('Preview ready. Opened preview tab.');
          }
        }
      } catch (previewErr) {
        onLog(`[WARN] Could not load preview: ${previewErr.message}`);
      }
    } catch (err) {
      onLog(`Unexpected error: ${err.message}`);
    } finally {
      logState((draft) => {
        draft.isProcessing = false;
        draft.processingType = null;
      });
    }
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

  const handleOpenLog = () => {
    tabState((draft) => {
      const exists = draft.openTabs.some((t) => t.id === 'ai-logs');
      if (!exists) {
        draft.openTabs = [{ id: 'ai-logs', type: 'logs', label: 'Log' }, ...draft.openTabs];
      }
      draft.activeTabId = 'ai-logs';
    });
  };

  const handleClearFS = () => {
    Compiler.reset();
    previewState((draft) => {
      draft.htmlContent = null;
    });
    Settings.setPreviewHtml(null);
    logState((draft) => {
      draft.logs.push({
        id: `${Date.now()}-${Math.random()}`,
        role: 'system',
        text: 'Virtual filesystem cleared. Next compile will start fresh.',
      });
    });
    // Switch to (and open) logs tab so the user can see the confirmation
    handleOpenLog();
  };

  const handleStartOver = () => {
    setIsStartOverDialogOpen(true);
  };

  const confirmStartOver = async () => {
    setIsStartOverDialogOpen(false);
    await fs.unlinkProject();
    Settings.reset();
    window.location.reload();
  };

  const cancelStartOver = () => {
    setIsStartOverDialogOpen(false);
  };

  const handleExportZip = async () => {
    setMenuPosition(null);
    const zip = new ZipWriter();

    if (fs.mode === 'local' && fs.rootHandle) {
      const traverse = async (handle, path = '') => {
        for await (const [name, entry] of handle.entries()) {
          const entryPath = path ? `${path}/${name}` : name;
          if (entry.kind === 'file') {
            // Use in-memory content if available (for unsaved changes), otherwise read from disk
            const inMemory = editorState.fileContents?.[entryPath];
            if (inMemory !== undefined) {
              zip.addFile(entryPath, inMemory);
            } else {
              const file = await entry.getFile();
              const content = await file.arrayBuffer();
              zip.addFile(entryPath, new Uint8Array(content));
            }
          } else if (entry.kind === 'directory') {
            await traverse(entry, entryPath);
          }
        }
      };
      await traverse(fs.rootHandle);
    } else {
      const traverse = (nodes, path = '') => {
        for (const node of nodes) {
          const nodePath = path ? `${path}/${node.name}` : node.name;
          if (node.type === 'file') {
            const content = editorState.fileContents?.[nodePath] || '';
            zip.addFile(nodePath, content);
          } else if (node.type === 'folder') {
            traverse(node.children || [], nodePath);
          }
        }
      };
      traverse(folderTree);
    }

    const blob = await zip.generateBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName.replace(/\s+/g, '_')}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const toggleTheme = () => {
    appState((draft) => {
      draft.theme = draft.theme === 'light' ? 'dark' : 'light';
    });
  };

  // Build Breadcrumb
  let breadcrumb = ['Zakamurai'];
  if (activeTab) {
    if (activeTab.type === 'file') {
      breadcrumb = activeTab.file?.path || [activeTab.label];
    } else if (activeTab.type === 'logs') {
      breadcrumb = ['System', 'Log'];
    } else if (activeTab.type === 'preview') {
      breadcrumb = ['dist', 'index.html'];
    }
  }

  const handleBreadcrumbClick = (_seg, index) => {
    const pathSegments = breadcrumb.slice(0, index + 1);
    const fullPath = pathSegments.join('/');

    sidebarState((draft) => {
      const current = draft.expandedFolders[fullPath] !== false;
      draft.expandedFolders = {
        ...draft.expandedFolders,
        [fullPath]: !current,
      };
    });
  };

  const handleMenuOpen = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({
      x: rect.right - 120, // Adjust based on menu width
      y: rect.bottom + 8,
    });
  };

  const handleMenuClose = () => {
    setMenuPosition(null);
  };

  return (
    <header className={styles.header}>
      <div className={styles.breadcrumb}>
        {breadcrumb.map((seg, i) => (
          <React.Fragment key={breadcrumb.slice(0, i + 1).join('/')}>
            <button
              type="button"
              onClick={() => handleBreadcrumbClick(seg, i)}
              onKeyDown={(e) => e.key === 'Enter' && handleBreadcrumbClick(seg, i)}
              className={`${styles.breadcrumbSegment} ${i === breadcrumb.length - 1 ? styles.active : ''}`}
            >
              {seg}
            </button>
            {i < breadcrumb.length - 1 && <Icons.ChevronRight />}
          </React.Fragment>
        ))}
      </div>
      <div className={styles.centerSection} />
      <div className={styles.actions}>
        {logState.isProcessing && (
          <div className={styles.workingIndicator}>
            {logState.processingType === 'ai' ? <Icons.BotSmall /> : <Icons.RefreshSmall />}
            <span>
              {logState.processingType === 'ai' ? 'AI is working...' : 'System is working...'}
            </span>
          </div>
        )}
        <div className={styles.compileGroup}>
          <Tooltip content="Compile Project">
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.compileBtn}`}
              onClick={handleCompile}
              disabled={isProcessing}
            >
              <Icons.Play />
              <span>Compile</span>
            </button>
          </Tooltip>
          <Tooltip content="Show Log">
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.terminalToggleBtn} ${activeTabId === 'ai-logs' ? styles.activeTab : ''}`}
              onClick={handleOpenLog}
            >
              <Icons.Terminal />
            </button>
          </Tooltip>
          <Tooltip content="Show Preview">
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.terminalToggleBtn} ${activeTabId === 'preview' ? styles.activeTab : ''}`}
              onClick={handleOpenPreview}
            >
              <Icons.Globe />
            </button>
          </Tooltip>
        </div>
        <Tooltip content="More actions">
          <button
            type="button"
            className={`${styles.actionBtn} ${menuPosition ? styles.active : ''}`}
            onClick={handleMenuOpen}
          >
            <Icons.MoreVertical />
          </button>
        </Tooltip>
        <ContextMenu position={menuPosition} onClose={handleMenuClose}>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              handleExportZip();
              handleMenuClose();
            }}
          >
            <Icons.Plus />
            <span>Export ZIP</span>
          </button>
          <button
            type="button"
            className={styles.menuItem}
            disabled={isProcessing}
            onClick={() => {
              handleStartOver();
              handleMenuClose();
            }}
          >
            <Icons.Refresh />
            <span>Start over</span>
          </button>
          <button
            type="button"
            className={styles.menuItem}
            disabled={isProcessing}
            onClick={() => {
              handleClearFS();
              handleMenuClose();
            }}
          >
            <Icons.Trash />
            <span>Clear FS</span>
          </button>
        </ContextMenu>
        <Tooltip content={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
          <button type="button" onClick={toggleTheme} className={styles.themeToggle}>
            {theme === 'light' ? <Icons.Moon /> : <Icons.Sun />}
          </button>
        </Tooltip>
      </div>
      <Dialog
        isOpen={isStartOverDialogOpen}
        title="Start Over?"
        message="Are you sure you want to start over? This will unlink the project and reset all files to defaults."
        onConfirm={confirmStartOver}
        onCancel={cancelStartOver}
        confirmText="Start Over"
        cancelText="Cancel"
        type="danger"
      />
    </header>
  );
}
