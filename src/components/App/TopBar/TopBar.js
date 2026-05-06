import React from 'react';
import { Icons } from '../Icons';
import { AppState } from '../App';
import { TabState } from '../TabBar';
import { SidebarState } from '../Sidebar';
import { EditorState } from '../EditorArea';
import { ZipWriter } from '../../../utils/zip';
import Tooltip from '../../Widgets/Tooltip/Tooltip';
import styles from './TopBar.module.css';

export default function TopBar() {
  const appState = AppState.useState();
  const { theme, projectName, fs } = appState;
  const tabState = TabState.useState();
  const { openTabs = [], activeTabId } = tabState;
  const sidebarState = SidebarState.useState();
  const { folderTree } = sidebarState;
  const editorState = EditorState.useState();
  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const handleExportZip = async () => {
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
      breadcrumb = activeTab.file.path || [activeTab.label];
    } else if (activeTab.type === 'logs') {
      breadcrumb = ['System', 'AI Output'];
    }
  }

  const handleBreadcrumbClick = (_seg, index) => {
    const pathSegments = breadcrumb.slice(0, index + 1);
    const fullPath = pathSegments.join('/');

    sidebarState((draft) => {
      draft.expandedFolders = {
        ...draft.expandedFolders,
        [fullPath]: !draft.expandedFolders[fullPath],
      };
    });
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
      <div className={styles.actions}>
        <Tooltip content="Export as ZIP">
          <button type="button" className={styles.actionBtn} onClick={handleExportZip}>
            <Icons.Plus />
            <span>Export ZIP</span>
          </button>
        </Tooltip>
        <Tooltip content={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
          <button
            type="button"
            onClick={toggleTheme}
            className={styles.themeToggle}
          >
            {theme === 'light' ? <Icons.Moon /> : <Icons.Sun />}
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
