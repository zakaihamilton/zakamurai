import Resizer from '@/components/ui/Resizer';
import { isMediaFile } from '@/utils/file';
import { FILE_VIEW_TYPES, getDefaultFileViewType } from '@/utils/fileViews';
import React from 'react';
import Node from '../../state/Node';
import { AppState } from '../AppState';
import { Prompt, PromptState, SidebarState, TabBar, TabState } from '../Panes';
import EditorArea from '../Views/EditorArea';
import ImageViewer from '../Views/ImageViewer';
import Instructions from '../Views/Instructions';
import LogArea from '../Views/LogArea';
import PreviewArea from '../Views/PreviewArea';
import ProjectInfo from '../Views/ProjectInfo';
import TokenBreakdown from '../Views/TokenBreakdown';
import Welcome from '../Views/Welcome';
import { requireStore } from '../types';
import styles from './WorkspaceArea.module.css';

export default function WorkspaceArea() {
  const appState = requireStore(AppState.useState(['isMobile']));
  const tabState = requireStore(TabState.useState(['openTabs', 'activeTabId']));
  const sidebarState = requireStore(SidebarState.useState(['showAIInput']));
  const promptState = requireStore(PromptState.useState(['promptWidth']));

  const { isMobile } = appState;
  const { openTabs = [], activeTabId } = tabState;
  const { showAIInput } = sidebarState;
  const { promptWidth } = promptState;

  const handlePromptResize = (clientX: number) => {
    if (showAIInput) {
      promptState((draft) => {
        const newWidth = window.innerWidth - clientX;
        draft.promptWidth = Math.max(300, Math.min(newWidth, 600));
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
      draft.promptWidth = 360;
    });
  };

  const activeTab = openTabs.find((t) => t.id === activeTabId);
  const activeFileViewType =
    activeTab?.type === 'file'
      ? activeTab.viewType || getDefaultFileViewType(activeTab.file?.name ?? '')
      : null;

  return (
    <div className={styles.workspaceContent}>
      <div className={styles.workspaceMain}>
        <TabBar />
        <div className={styles.editorContainer}>
          {activeTab?.type === 'file' &&
            (activeFileViewType === FILE_VIEW_TYPES.TOKEN_BREAKDOWN ? (
              <TokenBreakdown tab={activeTab} />
            ) : activeFileViewType === FILE_VIEW_TYPES.IMAGE_VIEWER ||
              isMediaFile(activeTab.file?.name) ? (
              <ImageViewer tab={activeTab} />
            ) : (
              <EditorArea key={activeTab.id} file={activeTab.file} fsHandle={activeTab.fsHandle} />
            ))}
          {activeTab?.type === 'logs' && <LogArea />}
          {activeTab?.type === 'preview' && <PreviewArea />}
          {activeTab?.type === 'project-info' && <ProjectInfo />}
          {activeTab?.type === 'instructions' && <Instructions />}
          {activeTab?.type === 'token-breakdown' && <TokenBreakdown tab={activeTab} />}
          {!activeTab && <Welcome />}
        </div>
      </div>
      {!isMobile && (
        <Node id="prompt-resizer">
          <Resizer
            onResize={handlePromptResize}
            onResizeStart={handleResizeStart}
            onResizeEnd={handleResizeEnd}
            onDoubleClick={handlePromptReset}
            value={promptWidth}
            min={300}
            max={600}
            label="Resize AI panel"
            className={!showAIInput ? styles.hidden : ''}
            isCollapsed={!showAIInput}
          />
        </Node>
      )}
      <Prompt />
    </div>
  );
}
