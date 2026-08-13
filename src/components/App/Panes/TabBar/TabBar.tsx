import { SidebarState } from '@/components/App/Panes/Sidebar';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import type { SidebarStateShape, TabBarUiStateShape, TabStateShape } from '@/types/domain-types';
import type React from 'react';
import { useRef, useState } from 'react';
import { createState } from 'triactor';
import type { StateStore } from 'triactor';
import { requireStore } from '../../types';
import styles from './TabBar.module.css';
import TabContextMenu from './TabContextMenu';
import TabItem from './TabItem';
import type { TabContextMenuState } from './tab-types';
import useTabDragAndDrop from './useTabDragAndDrop';

export const TabState = createState<TabStateShape>('TabState');
const TabBarUiState = createState<TabBarUiStateShape>('TabBarUiState');

const expandAncestors = (sidebarState: StateStore<SidebarStateShape>, filePath: string) => {
  if (!filePath) return;
  const segments = filePath.split('/');
  if (segments.length <= 1) return;

  sidebarState((draft) => {
    const newExpanded = { ...draft.expandedFolders };
    let runningPath = '';
    for (const seg of segments.slice(0, -1)) {
      runningPath = runningPath ? `${runningPath}/${seg}` : seg;
      newExpanded[runningPath] = true;
    }
    draft.expandedFolders = newExpanded;
  });
};

export default function TabBar() {
  const tabState = requireStore(TabState.useState());
  const { openTabs = [], activeTabId } = tabState;
  const sidebarState = requireStore(SidebarState.useState());
  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const tabBarUiState = requireStore(
    TabBarUiState.useState(null, {
      draggedTabId: null,
      dropTargetId: null,
      isOverBar: false,
    }),
  );
  const { draggedTabId = null, dropTargetId = null, isOverBar = false } = tabBarUiState || {};

  const resetDragState = () => {
    tabBarUiState((draft) => {
      draft.draggedTabId = null;
      draft.dropTargetId = null;
      draft.isOverBar = false;
    });
  };

  const handleTabClick = (tabId: string) => {
    tabState((draft) => {
      draft.activeTabId = tabId;
    });

    const tab = openTabs.find((t) => t.id === tabId);
    if (tab && tab.type === 'file' && tab.file?.path) {
      expandAncestors(sidebarState, tab.id);
    }
  };

  const handleTabKeyDown = (event: React.KeyboardEvent, tabId: string) => {
    const currentIndex = openTabs.findIndex((tab) => tab.id === tabId);
    if (currentIndex === -1) return;
    let targetIndex = currentIndex;
    if (event.key === 'ArrowLeft')
      targetIndex = (currentIndex - 1 + openTabs.length) % openTabs.length;
    if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % openTabs.length;
    if (event.key === 'Home') targetIndex = 0;
    if (event.key === 'End') targetIndex = openTabs.length - 1;
    if (targetIndex !== currentIndex) {
      event.preventDefault();
      const targetId = openTabs[targetIndex].id;
      handleTabClick(targetId);
      tabRefs.current.get(targetId)?.focus();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleTabClick(tabId);
    }
  };

  const closeTab = (e: React.MouseEvent | null, tabId: string) => {
    if (e) e.stopPropagation();
    tabState((draft) => {
      const filtered = draft.openTabs.filter((t) => t.id !== tabId);
      draft.openTabs = filtered;
      if (draft.activeTabId === tabId) {
        const newActiveTabId = filtered.length > 0 ? filtered[filtered.length - 1].id : null;
        draft.activeTabId = newActiveTabId;

        const tab = filtered.find((t) => t.id === newActiveTabId);
        if (tab && tab.type === 'file' && tab.file?.path) {
          expandAncestors(sidebarState, tab.id);
        }
      }
    });
  };

  const closeOtherTabs = (tabId: string) => {
    tabState((draft) => {
      const clickedTab = draft.openTabs.find((t) => t.id === tabId);
      if (!clickedTab) return;

      draft.openTabs = [clickedTab];
      draft.activeTabId = tabId;

      if (clickedTab.type === 'file' && clickedTab.file?.path) {
        expandAncestors(sidebarState, tabId);
      }
    });
  };

  const closeTabsToLeft = (tabId: string) => {
    tabState((draft) => {
      const clickedIndex = draft.openTabs.findIndex((t) => t.id === tabId);
      if (clickedIndex === -1) return;

      const keepTabs = draft.openTabs.slice(clickedIndex);
      const closedTabs = draft.openTabs.slice(0, clickedIndex);
      draft.openTabs = keepTabs;

      const wasActiveClosed = closedTabs.some((t) => t.id === draft.activeTabId);
      if (wasActiveClosed) {
        draft.activeTabId = tabId;
        const tab = keepTabs[keepTabs.length - 1];
        if (tab && tab.type === 'file' && tab.file?.path) {
          expandAncestors(sidebarState, tab.id);
        }
      }
    });
  };

  const closeTabsToRight = (tabId: string) => {
    tabState((draft) => {
      const clickedIndex = draft.openTabs.findIndex((t) => t.id === tabId);
      if (clickedIndex === -1) return;

      const keepTabs = draft.openTabs.slice(0, clickedIndex + 1);
      const closedTabs = draft.openTabs.slice(clickedIndex + 1);
      draft.openTabs = keepTabs;

      const wasActiveClosed = closedTabs.some((t) => t.id === draft.activeTabId);
      if (wasActiveClosed) {
        draft.activeTabId = tabId;
        const tab = keepTabs[keepTabs.length - 1];
        if (tab && tab.type === 'file' && tab.file?.path) {
          expandAncestors(sidebarState, tab.id);
        }
      }
    });
  };

  const handleClearAll = () => {
    tabState((draft) => {
      draft.openTabs = [];
      draft.activeTabId = null;
    });
  };

  const { handleDragStart, handleDragOver, handleDragEnd, handleDrop, handleDropOnBar } =
    useTabDragAndDrop({
      tabState,
      tabBarUiState,
      draggedTabId,
      resetDragState,
    });

  if (openTabs.length === 0) return null;

  return (
    <div
      className={`${styles.tabBarContainer} ${isOverBar ? styles.barDropTarget : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        tabBarUiState((draft) => {
          draft.isOverBar = true;
          draft.dropTargetId = null;
        });
      }}
      onDragLeave={() =>
        tabBarUiState((draft) => {
          draft.isOverBar = false;
        })
      }
      onDrop={handleDropOnBar}
    >
      <div className={styles.tabBar} role="tablist" aria-label="Open files">
        {openTabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={activeTabId === tab.id}
            isDragging={draggedTabId === tab.id}
            isDropTarget={dropTargetId === tab.id}
            onTabClick={handleTabClick}
            onCloseTab={closeTab}
            onContextMenu={(e, t) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({
                tab: t,
                position: { x: e.clientX, y: e.clientY },
              });
            }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            tabRef={(element) => {
              if (element) tabRefs.current.set(tab.id, element);
              else tabRefs.current.delete(tab.id);
            }}
            onKeyDown={handleTabKeyDown}
          />
        ))}
      </div>
      {openTabs.length > 1 && (
        <div className={styles.tabActions}>
          <Tooltip content="Close all tabs" shortcut="⌃⇧W">
            <button
              type="button"
              onClick={handleClearAll}
              className={styles.clearAllButton}
              aria-label="Close all tabs"
            >
              <Icons.ListX />
            </button>
          </Tooltip>
        </div>
      )}
      {contextMenu && (
        <TabContextMenu
          tab={contextMenu.tab}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onCloseTab={(id) => closeTab(null, id)}
          onCloseOthers={closeOtherTabs}
          onCloseToLeft={closeTabsToLeft}
          onCloseToRight={closeTabsToRight}
          onCloseAll={handleClearAll}
        />
      )}
    </div>
  );
}
