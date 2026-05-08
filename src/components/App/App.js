'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Compiler } from '../../utils/compiler';
import { createState } from '../Core/Base/State';
import { useFileSystem } from '../Storage';
import { DEFAULT_CONTENTS, DEFAULT_FILES } from '../Storage/InitialData';
import Settings from '../Storage/Settings';
import styles from './App.module.css';
import EditorArea, { EditorState } from './EditorArea';
import { Icons } from './Icons';
import LogArea, { LogState } from './LogArea';
import PreviewArea from './PreviewArea';
import Sidebar, { SidebarState } from './Sidebar';
import TabBar, { TabState } from './TabBar';
import TopBar from './TopBar';
import Prompt, { PromptState } from './Prompt';
import Resizer from '../Widgets/Resizer/Resizer';

export const AppState = createState('AppState');
export const PreviewState = createState('PreviewState');

function PreviewRestorer() {
  const previewState = PreviewState.useState();
  const { htmlContent } = previewState;
  const { fs } = AppState.useState();
  const sidebarState = SidebarState.useState();
  const editorState = EditorState.useState();
  const restoredRef = React.useRef(false);

  useEffect(() => {
    if (restoredRef.current || !fs?.isReady) return;
    restoredRef.current = true;

    if (htmlContent) {
      const restore = async () => {
        try {
          console.log('[PreviewRestorer] Starting restore, htmlContent length:', htmlContent.length);
          const compiler = new Compiler(() => {});
          const container = await compiler.init();
          console.log('[PreviewRestorer] Container initialized, serverBridge:', !!container.serverBridge);
          if (!container.vfs.existsSync('/dist')) {
            container.vfs.mkdirSync('/dist', { recursive: true });
          }
          container.vfs.writeFileSync('/dist/index.html', htmlContent);
          container.vfs.writeFileSync('/index.html', htmlContent);
          console.log('[PreviewRestorer] VFS seeded. /dist/index.html exists:', container.vfs.existsSync('/dist/index.html'));
          console.log('[PreviewRestorer] /index.html exists:', container.vfs.existsSync('/index.html'));

          // List /dist contents for debugging
          try {
            const distFiles = container.vfs.readdirSync('/dist');
            console.log('[PreviewRestorer] /dist contents:', distFiles);
          } catch (e) {
            console.log('[PreviewRestorer] Could not list /dist:', e.message);
          }

          // Also sync files so that imports in index.html work
          await compiler.syncFiles(fs, sidebarState.folderTree, editorState.fileContents);

          // Verify SW state
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            console.log('[PreviewRestorer] SW registration:', reg ? {
              scope: reg.scope,
              active: !!reg.active,
              waiting: !!reg.waiting,
              installing: !!reg.installing,
              activeScriptURL: reg.active?.scriptURL,
            } : 'none');
            console.log('[PreviewRestorer] SW controller:', !!navigator.serviceWorker.controller);
          }

          // Verification fetch: test that the preview path is served by the SW
          try {
            console.log('[PreviewRestorer] Running verification fetch for /preview/...');
            const resp = await fetch('/preview/');
            console.log('[PreviewRestorer] Verification fetch result:', {
              status: resp.status,
              statusText: resp.statusText,
              contentType: resp.headers.get('content-type'),
              bodyLength: (await resp.clone().text()).length,
            });
          } catch (fetchErr) {
            console.error('[PreviewRestorer] Verification fetch failed:', fetchErr);
          }
        } catch (e) {
          console.error('Failed to restore preview filesystem', e);
        } finally {
          // Mark as ready even on error so we don't stay stuck
          previewState((draft) => {
            draft.isCompilerReady = true;
          });
        }
      };
      restore();
    } else if (!htmlContent) {
      // If no content, it's "ready" in the sense that there's nothing to restore
      previewState((draft) => {
        draft.isCompilerReady = true;
      });
    }
  }, [htmlContent, fs, sidebarState.folderTree, editorState.fileContents, previewState]);

  return null;
}

export default function App() {
  const fs = useFileSystem();
  const [initialProjectName] = useState(() => Settings.getProjectName());

  const initialFiles = useMemo(() => DEFAULT_FILES, []);

  const initialContents = useMemo(() => {
    const stored = Settings.getFileContents();
    if (stored && Object.keys(stored).length > 0) return stored;
    return DEFAULT_CONTENTS;
  }, []);

  const initialTheme = Settings.getTheme();

  const initialTabs = useMemo(() => {
    const stored = Settings.getOpenTabs();
    if (stored && stored.length > 0) return stored;
    return [{ id: 'ai-logs', type: 'logs', label: 'Log' }];
  }, []);

  const initialActiveTabId = useMemo(() => Settings.getActiveTabId() || 'ai-logs', []);
  const initialAILogs = useMemo(() => {
    const stored = Settings.getAILogs();
    if (stored && stored.length > 0) return stored;
    return [{ id: 1, role: 'ai', text: 'Zakamurai Log initialized. Ready for commands.' }];
  }, []);

  const initialSidebarWidth = useMemo(() => Settings.getSidebarWidth(), []);
  const initialPromptWidth = useMemo(() => Settings.getPromptWidth(), []);

  return (
    <div className={styles.root}>
      <AppState theme={initialTheme} projectName={initialProjectName} fs={fs}>
        <ProjectNameSaver />
        <SidebarState isSidebarOpen={true} showAIInput={true} folderTree={initialFiles} sidebarWidth={initialSidebarWidth}>
          <TabState openTabs={initialTabs} activeTabId={initialActiveTabId}>
            <LogState isProcessing={false} logs={initialAILogs}>
              <EditorState fileContents={initialContents}>
                <PromptState promptWidth={initialPromptWidth}>
                  <PreviewState htmlContent={Settings.getPreviewHtml()} isCompilerReady={false}>
                    <TabRestorer />
                    <PreviewRestorer />
                    <ContentSaver />
                    <PassiveWrapper />
                  </PreviewState>
                </PromptState>
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
  const { htmlContent, isCompilerReady } = PreviewState.useState();
  const activeTab = openTabs.find((t) => t.id === activeTabId);

  const sidebarState = SidebarState.useState();
  const promptState = PromptState.useState();
  const { isSidebarOpen, sidebarWidth } = sidebarState;
  const { showAIInput } = sidebarState;
  const { promptWidth } = promptState;
  const [isResizing, setIsResizing] = useState(false);

  // Sync theme with document.body for global Portals
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light');
    } else {
      document.body.classList.remove('light');
    }
  }, [theme]);

  // Save theme to localStorage on change
  useEffect(() => {
    Settings.setTheme(theme);
  }, [theme]);

  // Save widths to localStorage on change
  useEffect(() => {
    Settings.setSidebarWidth(sidebarWidth);
  }, [sidebarWidth]);

  useEffect(() => {
    Settings.setPromptWidth(promptWidth);
  }, [promptWidth]);

  const handleSidebarResize = (clientX) => {
    if (isSidebarOpen) {
      sidebarState((draft) => {
        draft.sidebarWidth = Math.max(160, Math.min(clientX, 600));
      });
    }
  };

  const handlePromptResize = (clientX) => {
    if (showAIInput) {
      promptState((draft) => {
        const newWidth = window.innerWidth - clientX;
        draft.promptWidth = Math.max(260, Math.min(newWidth, 600));
      });
    }
  };

  const handleResizeStart = () => setIsResizing(true);
  const handleResizeEnd = () => setIsResizing(false);

  const handleSidebarReset = () => {
    sidebarState((draft) => {
      draft.sidebarWidth = 260;
    });
  };

  const handlePromptReset = () => {
    promptState((draft) => {
      draft.promptWidth = 340;
    });
  };

  return (
    <div className={`${styles.appWrapper} ${theme === 'light' ? styles.light : ''} ${isResizing ? styles.isResizing : ''}`}>
      <Sidebar />
      {isSidebarOpen && (
        <Resizer
          onResize={handleSidebarResize}
          onResizeStart={handleResizeStart}
          onResizeEnd={handleResizeEnd}
          onDoubleClick={handleSidebarReset}
        />
      )}
      <div className={styles.mainContent}>
        <TopBar />
        <div className={styles.workspaceContent}>
          <div className={styles.workspaceMain}>
            <TabBar />
            <div className={styles.editorContainer}>
              {activeTab?.type === 'file' && <EditorArea file={activeTab.file} />}
              {activeTab?.type === 'logs' && <LogArea />}
              {activeTab?.type === 'preview' && (
                <PreviewArea htmlContent={htmlContent} isCompilerReady={isCompilerReady} />
              )}
              {!activeTab && (
                <div className={styles.emptyState}>
                  <Icons.Bot />
                  <p className={styles.emptyStateText}>
                    No open tabs. Select a file from the explorer.
                  </p>
                </div>
              )}
            </div>
          </div>
          {showAIInput && (
            <Resizer
              onResize={handlePromptResize}
              onResizeStart={handleResizeStart}
              onResizeEnd={handleResizeEnd}
              onDoubleClick={handlePromptReset}
            />
          )}
          <Prompt />
        </div>
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
  const { fileContents, pendingDiffs } = EditorState.useState();
  useEffect(() => {
    const timer = setTimeout(() => {
      const contentsToSave = { ...fileContents };
      if (pendingDiffs) {
        for (const [path, diff] of Object.entries(pendingDiffs)) {
          if (diff.originalContent !== undefined) {
            contentsToSave[path] = diff.originalContent;
          }
        }
      }
      Settings.setFileContents(contentsToSave);
    }, 1000);
    return () => clearTimeout(timer);
  }, [fileContents, pendingDiffs]);
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
