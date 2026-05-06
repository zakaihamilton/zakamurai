'use client';

import React, { useEffect, useState } from 'react';
import { createState } from '../Core/Base/State';
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
  const initialFiles = [
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
  ];

  const initialContents = {
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

  const initialTheme = (typeof window !== 'undefined' && localStorage.getItem('zakamurai-theme')) || 'dark';

  return (
    <div className={styles.root}>
      <AppState theme={initialTheme} projectName="My NextJS App">
        <SidebarState
          isSidebarOpen={true}
          showAIInput={true}
          folderTree={initialFiles}
          expandedFolders={{ src: true, 'src/components': true }}
        >
          <TabState
            openTabs={[{ id: 'ai-logs', type: 'logs', label: 'AI Output' }]}
            activeTabId={'ai-logs'}
          >
            <LogState
              isProcessing={false}
              logs={[
                { id: 1, role: 'ai', text: 'Zakamurai Core Engine initialized. Project context synced.' },
              ]}
            >
              <EditorState fileContents={initialContents}>
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
    localStorage.setItem('zakamurai-theme', theme);
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
