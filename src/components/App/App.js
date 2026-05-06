'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createState } from '../Core/Base/State';
import { useFileSystem } from '../Storage';
import Settings from '../Storage/Settings';
import styles from './App.module.css';
import EditorArea, { EditorState } from './EditorArea';
import { Icons } from './Icons';
import LogArea, { LogState } from './LogArea';
import PromptFooter from './PromptFooter';
import Sidebar, { SidebarState } from './Sidebar';
import TabBar, { TabState } from './TabBar';
import TopBar from './TopBar';

export const AppState = createState('AppState');

export default function App() {
  const fs = useFileSystem();
  const [initialProjectName] = useState(() => Settings.getProjectName());

  const initialFiles = useMemo(
    () => [
      {
        name: 'src',
        type: 'folder',
        children: [
          {
            name: 'components',
            type: 'folder',
            children: [
              { name: 'Sidebar.jsx', type: 'file' },
              { name: 'Editor.jsx', type: 'file' },
            ],
          },
          { name: 'App.jsx', type: 'file' },
        ],
      },
      { name: 'lib', type: 'folder', children: [{ name: 'state.js', type: 'file' }] },
      { name: 'package.json', type: 'file' },
    ],
    [],
  );

  const initialContents = useMemo(() => {
    const stored = Settings.getFileContents();
    if (stored && Object.keys(stored).length > 0) return stored;
    return {
      'src/components/Sidebar.jsx':
        'export default function Sidebar() {\n  return (\n    <aside>\n      <h2>Sidebar</h2>\n    </aside>\n  );\n}',
      'src/components/Editor.jsx':
        'export default function Editor() {\n  return (\n    <div>\n      <h1>Code Editor</h1>\n    </div>\n  );\n}',
      'src/App.jsx':
        'import Sidebar from "./components/Sidebar";\nimport Editor from "./components/Editor";\n\nexport default function App() {\n  return (\n    <main>\n      <Sidebar />\n      <Editor />\n    </main>\n  );\n}',
      'lib/state.js': 'export const ZakamuraiState = {};',
      'package.json':
        '{\n  "name": "zakamurai",\n  "version": "0.1.0",\n  "dependencies": {\n    "react": "^18.2.0"\n  }\n}',
    };
  }, []);

  const initialTheme = Settings.getTheme();

  const initialTabs = useMemo(() => {
    const stored = Settings.getOpenTabs();
    if (stored && stored.length > 0) return stored;
    return [{ id: 'ai-logs', type: 'logs', label: 'Log' }];
  }, []);

  const initialActiveTabId = useMemo(() => Settings.getActiveTabId() || 'ai-logs', []);
  const initialExpandedFolders = useMemo(() => ({ src: true, 'src/components': true }), []);
  const initialAILogs = useMemo(() => {
    const stored = Settings.getAILogs();
    if (stored && stored.length > 0) return stored;
    return [{ id: 1, role: 'ai', text: 'Zakamurai Log initialized. Ready for commands.' }];
  }, []);

  return (
    <div className={styles.root}>
      <AppState theme={initialTheme} projectName={initialProjectName} fs={fs}>
        <ProjectNameSaver />
        <SidebarState
          isSidebarOpen={true}
          showAIInput={true}
          folderTree={initialFiles}
          expandedFolders={initialExpandedFolders}
        >
          <TabState openTabs={initialTabs} activeTabId={initialActiveTabId}>
            <LogState isProcessing={false} logs={initialAILogs}>
              <EditorState fileContents={initialContents}>
                <TabRestorer />
                <ContentSaver />
                <PassiveWrapper />
              </EditorState>
            </LogState>
          </TabState>
        </SidebarState>
      </AppState>
    </div>
  );
}

function PassiveWrapper() {
  const { theme } = AppState.useState();
  const { openTabs = [], activeTabId } = TabState.useState();
  const activeTab = openTabs.find((t) => t.id === activeTabId);

  // Save theme to localStorage on change
  useEffect(() => {
    Settings.setTheme(theme);
  }, [theme]);

  return (
    <div className={`${styles.appWrapper} ${theme === 'light' ? styles.light : ''}`}>
      <Sidebar />
      <div className={styles.mainContent}>
        <TopBar />
        <TabBar />
        <div className={styles.editorContainer}>
          {activeTab?.type === 'file' && <EditorArea file={activeTab.file} />}
          {activeTab?.type === 'logs' && <LogArea />}
          {!activeTab && (
            <div className={styles.emptyState}>
              <Icons.Bot />
              <p className={styles.emptyStateText}>
                No open tabs. Select a file from the explorer.
              </p>
            </div>
          )}
        </div>
        <PromptFooter />
      </div>
    </div>
  );
}

function ProjectNameSaver() {
  const { projectName } = AppState.useState();
  useEffect(() => {
    Settings.setProjectName(projectName);
  }, [projectName]);
  return null;
}

function ContentSaver() {
  const { fileContents } = EditorState.useState();
  useEffect(() => {
    const timer = setTimeout(() => {
      Settings.setFileContents(fileContents);
    }, 1000);
    return () => clearTimeout(timer);
  }, [fileContents]);
  return null;
}

function TabRestorer() {
  const { fs } = AppState.useState();
  const tabState = TabState.useState();
  const editorState = EditorState.useState();
  const lastRootHandleRef = React.useRef(null);

  useEffect(() => {
    if (!fs?.rootHandle || !fs?.getFileHandleAtPath) return;
    if (fs.rootHandle === lastRootHandleRef.current) return;

    const restore = async () => {
      lastRootHandleRef.current = fs.rootHandle;
      const parsedTabs = tabState.openTabs.length > 0 ? tabState.openTabs : Settings.getOpenTabs();
      const savedActiveTabId = tabState.activeTabId || Settings.getActiveTabId();

      if (parsedTabs && parsedTabs.length > 0) {
        const restoredTabs = [];
        const newContents = {};

        for (const tab of parsedTabs) {
          if (tab.type === 'file') {
            try {
              const handle = await fs.getFileHandleAtPath(tab.id);
              if (handle) {
                const content = await fs.readFile(handle);
                restoredTabs.push({
                  ...tab,
                  file: { name: tab.label, path: tab.id.split('/') },
                  fsHandle: handle,
                });
                if (content !== undefined && !editorState.fileContents?.[tab.id]) {
                  newContents[tab.id] = content;
                }
              }
            } catch (e) {
              console.error(`Failed to restore tab ${tab.id}`, e);
            }
          } else {
            restoredTabs.push(tab);
          }
        }

        if (restoredTabs.length > 0) {
          editorState((draft) => {
            draft.fileContents = { ...draft.fileContents, ...newContents };
          });
          tabState((draft) => {
            draft.openTabs = restoredTabs;
            if (savedActiveTabId && restoredTabs.some((t) => t.id === savedActiveTabId)) {
              draft.activeTabId = savedActiveTabId;
            }
          });
        }
      }
    };

    restore();
  }, [fs, tabState, editorState]);

  return null;
}
