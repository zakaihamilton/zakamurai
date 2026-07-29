import type { FlatTreeRow, NormalizedTreeNode } from '@/components/App/types';
import type { SidebarUiStateShape } from '@/components/state/domain-types';
import type {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  ReactNode,
  RefObject,
} from 'react';

export type SidebarCreateRow = FlatTreeRow & {
  key: string;
  isCreateRow?: boolean;
  createType?: 'file' | 'folder' | string;
  parentRow?: FlatTreeRow;
  level?: number;
};

export type CreateRowInputProps = {
  row: SidebarCreateRow;
  onCreate: (
    parentRow: FlatTreeRow | undefined,
    createType: string,
    name: string,
  ) => Promise<boolean | void>;
  onCancelCreate: () => void;
};

export type SidebarFilterProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export type SidebarMountSectionProps = {
  hasFileSystem: boolean;
  onMountLocal: () => void;
};

export type SidebarUiKey = keyof SidebarUiStateShape;

export type SidebarTreeRow = FlatTreeRow & {
  key: string;
  isCreateRow?: boolean;
  createType?: string;
  parentRow?: FlatTreeRow;
};

export type SidebarTreeProps = {
  rows: SidebarTreeRow[];
  activeTabId: string | null;
  scrollToIndex?: number;
  filterText: string;
  expandedFolders: Record<string, boolean>;
  loadingPaths: Record<string, boolean>;
  draggedPath: string | null;
  dropTargetPath: string | null;
  isOpen: boolean;
  hasFileSystem: boolean;
  onToggle: (row: FlatTreeRow) => void;
  onOpenFile: (row: FlatTreeRow) => void;
  onRename: (row: FlatTreeRow, name: string) => Promise<void> | void;
  onCreate: (
    parentRow: FlatTreeRow | undefined,
    type: string,
    name: string,
  ) => Promise<boolean | void>;
  onStartCreate: (row: FlatTreeRow, type: string) => void;
  onCancelCreate: () => void;
  onDelete: (row: FlatTreeRow) => Promise<void> | void;
  onDragStart: (event: DragEvent, row: FlatTreeRow) => void;
  onDragOver: (event: DragEvent, row: FlatTreeRow) => void;
  onDragEnter: (event: DragEvent, row: FlatTreeRow) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent, row: FlatTreeRow) => void;
  onDragEnd: () => void;
};

export type VirtualListProps<T extends { key?: string; pathStr?: string }> = {
  items: T[];
  itemHeight: number;
  overscan?: number;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  style?: CSSProperties;
  scrollKey?: string | null;
  scrollToIndex?: number | null;
};

export type TreeItemControls = {
  isEditing: boolean;
  editValue: string;
  setEditValue: (value: string) => void;
  editInputRef: RefObject<HTMLInputElement | null>;
  contextMenu: { x: number; y: number } | null;
  showDeleteDialog: boolean;
  setShowDeleteDialog: (value: boolean) => void;
  longPressHandlers: Record<string, unknown>;
  handleContextMenu: (event: React.MouseEvent) => void;
  startRename: () => void;
  stopEditing: () => void;
  submitRename: () => void;
  startCreate: (type: string) => void;
  startDelete: () => void;
  closeContextMenu: () => void;
  openWith: (app: string) => void;
};

export type TreeItemContentProps = {
  controls: TreeItemControls;
  filterText: string;
  isActive: boolean;
  isDragged: boolean;
  isDropTarget: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  onDelete: (row: FlatTreeRow) => Promise<void> | void;
  onDragEnd: () => void;
  onDragEnter: (event: DragEvent, row: FlatTreeRow) => void;
  onDragLeave: () => void;
  onDragOver: (event: DragEvent, row: FlatTreeRow) => void;
  onDragStart: (event: DragEvent, row: FlatTreeRow) => void;
  onDrop: (event: DragEvent, row: FlatTreeRow) => void;
  onOpenFile: (row: FlatTreeRow) => void;
  onToggle: (row: FlatTreeRow) => void;
  row: SidebarTreeRow;
};

export type NormalizedTreeItem = NormalizedTreeNode & {
  isRoot?: boolean;
  handle?: FileSystemDirectoryHandle | null;
};

