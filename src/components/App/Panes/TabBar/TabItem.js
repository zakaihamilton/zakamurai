import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip/Tooltip';
import { isMediaFile } from '@/utils/file';
import { FILE_VIEW_TYPES, getFileViewByType } from '@/utils/fileViews';
import styles from './TabBar.module.css';

const getTabViewType = (tab) => {
  if (tab.type === 'file') return getFileViewByType(tab.file?.name, tab.viewType).label;
  if (tab.type === 'token-breakdown') return 'Token Breakdown';
  if (tab.type === 'logs') return 'Logs';
  if (tab.type === 'preview') return 'Preview';
  if (tab.type === 'project-info') return 'Project Info';
  if (tab.type === 'instructions') return 'Instructions';
  return tab.type || 'View';
};

const getTabTooltipContent = (tab) => {
  const target = tab.type === 'file' ? tab.id : tab.sourceFilePath || tab.label;
  return `${getTabViewType(tab)}\n${target}`;
};

export default function TabItem({
  tab,
  isActive,
  isDragging,
  isDropTarget,
  onTabClick,
  onCloseTab,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: tab contains a nested close button and drag handlers
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => onDragStart(e, tab.id)}
      onDragOver={(e) => onDragOver(e, tab.id)}
      onDragEnd={onDragEnd}
      onDrop={(e) => onDrop(e, tab.id)}
      onClick={() => onTabClick(tab.id)}
      onKeyDown={(e) => e.key === 'Enter' && onTabClick(tab.id)}
      onContextMenu={(e) => onContextMenu(e, tab)}
      className={`${styles.tab} ${isActive ? styles.activeTab : styles.inactiveTab} ${
        isDragging ? styles.tabDragging : ''
      } ${isDropTarget ? styles.dropTarget : ''}`}
    >
      <span className={`${styles.tabIcon} ${isActive ? styles.tabIconActive : ''}`}>
        {tab.type === 'logs' ? (
          <Icons.BotSmall />
        ) : tab.type === 'preview' ? (
          <Icons.Globe />
        ) : tab.type === 'project-info' ? (
          <Icons.Info />
        ) : tab.type === 'token-breakdown' ? (
          <Icons.Tokens size={14} />
        ) : tab.viewType === FILE_VIEW_TYPES.IMAGE_VIEWER || isMediaFile(tab.file?.name) ? (
          <Icons.Image />
        ) : tab.viewType === FILE_VIEW_TYPES.TOKEN_BREAKDOWN ? (
          <Icons.Tokens size={14} />
        ) : (
          <Icons.File />
        )}
      </span>
      <Tooltip content={getTabTooltipContent(tab)} className={styles.tabLabelTooltip}>
        <span className={styles.tabLabelText}>{tab.label}</span>
      </Tooltip>
      <Tooltip content="Close Tab" shortcut="⌃W">
        <button
          type="button"
          onClick={(e) => onCloseTab(e, tab.id)}
          onKeyDown={(e) => e.key === 'Enter' && onCloseTab(e, tab.id)}
          className={styles.closeButton}
          style={{ opacity: isActive ? 1 : 0.5 }}
          aria-label="Close Tab"
        >
          <Icons.Close />
        </button>
      </Tooltip>
    </div>
  );
}
