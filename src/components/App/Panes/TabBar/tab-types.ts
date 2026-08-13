import type { StateStore } from '@/components/state/types';
import type { Tab, TabBarUiStateShape, TabStateShape } from '@/types/domain-types';
import type { DragEvent, KeyboardEvent, MouseEvent, RefCallback } from 'react';

export type TabContextMenuState = {
  tab: Tab;
  position: { x: number; y: number };
};

export type TabItemProps = {
  tab: Tab;
  isActive: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onTabClick: (tabId: string) => void;
  onCloseTab: (event: MouseEvent<HTMLButtonElement> | null, tabId: string) => void;
  onContextMenu: (event: MouseEvent, tab: Tab) => void;
  onDragStart: (event: DragEvent, tabId: string) => void;
  onDragOver: (event: DragEvent, tabId: string) => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent, tabId: string) => void;
  tabRef: RefCallback<HTMLDivElement | null>;
  onKeyDown: (event: KeyboardEvent, tabId: string) => void;
};

export type TabContextMenuProps = {
  tab: Tab;
  position: { x: number; y: number };
  onClose: () => void;
  onCloseTab: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseToLeft: (tabId: string) => void;
  onCloseToRight: (tabId: string) => void;
  onCloseAll: () => void;
};

export type UseTabDragAndDropParams = {
  tabState: StateStore<TabStateShape>;
  tabBarUiState: StateStore<TabBarUiStateShape>;
  draggedTabId: string | null;
  resetDragState: () => void;
};
