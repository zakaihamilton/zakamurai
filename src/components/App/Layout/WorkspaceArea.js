import Resizer from '@/components/Widgets/Resizer/Resizer';
import React from 'react';
import Node from '../../Core/Base/Node';
import styles from '../App.module.css';
import { AppState } from '../AppState';
import { Prompt, PromptState, SidebarState, TabBar, TabState } from '../Panes';
import { PreviewState } from '../PreviewState';
import Dashboard from '../Views/Dashboard';
import EditorArea from '../Views/EditorArea';
import LogArea from '../Views/LogArea';
import PreviewArea from '../Views/PreviewArea';

export default function WorkspaceArea() {
  const appState = AppState.useState();
  const tabState = TabState.useState();
  const previewState = PreviewState.useState();
  const sidebarState = SidebarState.useState();
  const promptState = PromptState.useState();

  const { isMobile } = appState;
  const { openTabs = [], activeTabId } = tabState;
  const { htmlContent, isCompilerReady } = previewState;
  const { showAIInput } = sidebarState;

  const handlePromptResize = (clientX) => {
    if (showAIInput) {
      promptState((draft) => {
        const newWidth = window.innerWidth - clientX;
        draft.promptWidth = Math.max(260, Math.min(newWidth, 600));
      });
    }
  };

  const handleResizeStart = () => {
    appState((draft) => {
      draft.isResizing = true;
    });
  };

  const handleResizeEnd = () => {
    appState((draft) => {
      draft.isResizing = false;
    });
  };

  const handlePromptReset = () => {
    promptState((draft) => {
      draft.promptWidth = 340;
    });
  };

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  return (
    <div className={styles.workspaceContent}>
      <div className={styles.workspaceMain}>
        <TabBar />
        <div className={styles.editorContainer}>
          {activeTab?.type === 'file' && <EditorArea file={activeTab.file} />}
          {activeTab?.type === 'logs' && <LogArea />}
          {activeTab?.type === 'preview' && (
            <PreviewArea htmlContent={htmlContent} isCompilerReady={isCompilerReady} />
          )}
          {!activeTab && <Dashboard />}
        </div>
      </div>
      {showAIInput && !isMobile && (
        <Node>
          <Resizer
            onResize={handlePromptResize}
            onResizeStart={handleResizeStart}
            onResizeEnd={handleResizeEnd}
            onDoubleClick={handlePromptReset}
          />
        </Node>
      )}
      <Prompt />
    </div>
  );
}
