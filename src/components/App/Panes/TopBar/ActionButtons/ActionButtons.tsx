import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { PreviewState } from '@/components/App/PreviewState';
import { LogState } from '@/components/App/Views/LogArea';
import { Icons } from '@/components/ui/Icons';
import ToolbarButton from '@/components/ui/ToolbarButton';
import Tooltip from '@/components/ui/Tooltip';
import { formatShortcut } from '@/utils/os';
import { useEffect, useMemo, useRef, useState } from 'react';
import { requireStore } from '../../../types';
import type { ActionButtonsProps } from '../topbar-types';
import styles from './ActionButtons.module.css';
import ViewSwitcher from './ViewSwitcher';

const isViewTab = (tabId: string | null | undefined): boolean =>
  tabId === 'ai-logs' || tabId === 'preview';

const REBUILD_HOLD_DELAY = 600;

export default function ActionButtons({
  onCompile,
  onStopAI,
  onRebuild,
  onOpenLog,
  onOpenPreview,
  onToggleAIInput,
}: ActionButtonsProps) {
  const [isRebuildReady, setIsRebuildReady] = useState(false);
  const rebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);
  const { isSystemProcessing, isAIProcessing } = requireStore(
    LogState.useState(['isSystemProcessing', 'isAIProcessing']),
  );
  const { compileStatus, compilePhase } = requireStore(
    PreviewState.useState(['compileStatus', 'compilePhase']),
  );
  const tabState = requireStore(TabState.useState(['activeTabId', 'openTabs', 'lastCodeTabId']));
  const { activeTabId, openTabs = [], lastCodeTabId } = tabState;
  const { isMobile } = requireStore(AppState.useState('isMobile'));
  const { showAIInput, isAIInputPopupOpen } = requireStore(
    SidebarState.useState(['showAIInput', 'isAIInputPopupOpen']),
  );
  const isAIInputActive = isMobile ? isAIInputPopupOpen : showAIInput;
  const lastContentTabIdRef = useRef(lastCodeTabId);
  const lastContentTabId =
    activeTabId && !isViewTab(activeTabId) ? activeTabId : lastContentTabIdRef.current;

  const lastContentTab = useMemo(
    () => openTabs.find((tab) => tab.id === lastContentTabId && !isViewTab(tab.id)),
    [lastContentTabId, openTabs],
  );
  const activeView =
    activeTabId === 'ai-logs' ? 'Logs' : activeTabId === 'preview' ? 'Preview' : 'Code';

  useEffect(() => {
    if (activeTabId && !isViewTab(activeTabId)) {
      lastContentTabIdRef.current = activeTabId;
      tabState((draft) => {
        draft.lastCodeTabId = activeTabId;
      });
    }
  }, [activeTabId, tabState]);

  useEffect(
    () => () => {
      if (rebuildTimerRef.current) clearTimeout(rebuildTimerRef.current);
    },
    [],
  );

  const clearRebuildTimer = () => {
    if (!rebuildTimerRef.current) return;
    clearTimeout(rebuildTimerRef.current);
    rebuildTimerRef.current = null;
  };

  const handleBuildPointerDown = () => {
    if (isSystemProcessing) return;
    didLongPressRef.current = false;
    rebuildTimerRef.current = setTimeout(() => {
      rebuildTimerRef.current = null;
      didLongPressRef.current = true;
      setIsRebuildReady(true);
    }, REBUILD_HOLD_DELAY);
  };

  const handleBuildPointerUp = () => {
    clearRebuildTimer();
    if (!didLongPressRef.current) return;
    setIsRebuildReady(false);
    onRebuild();
  };

  const handleBuildPointerCancel = () => {
    clearRebuildTimer();
    didLongPressRef.current = false;
    setIsRebuildReady(false);
  };

  const handleBuildClick = () => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    onCompile();
  };

  const handleStopAIClick = () => {
    onStopAI?.();
  };

  const buildTooltip = isAIProcessing
    ? 'Stop Agent'
    : compileStatus === 'building'
      ? `Stop Build — ${compilePhase || 'Compiling…'}`
      : isRebuildReady
        ? 'Release to rebuild from a fresh compiler environment'
        : 'Build Project (hold to rebuild)';

  const handleOpenLastContentTab = () => {
    if (!lastContentTab) return;

    tabState((draft) => {
      draft.activeTabId = lastContentTab.id;
    });
  };

  return (
    <div className={styles.actionGroups}>
      <div className={styles.compileGroup}>
        <Tooltip content={buildTooltip} shortcut={formatShortcut(isAIProcessing ? '⌘.' : '⌘↵')}>
          <button
            type="button"
            className={styles.compileBtn}
            onClick={isAIProcessing ? handleStopAIClick : handleBuildClick}
            onPointerDown={isAIProcessing ? undefined : handleBuildPointerDown}
            onPointerUp={isAIProcessing ? undefined : handleBuildPointerUp}
            onPointerCancel={isAIProcessing ? undefined : handleBuildPointerCancel}
            onPointerLeave={isAIProcessing ? undefined : handleBuildPointerCancel}
            disabled={isSystemProcessing && !isAIProcessing}
            aria-label={
              isAIProcessing
                ? 'Stop Agent'
                : compileStatus === 'building'
                  ? 'Stop Build'
                  : isRebuildReady
                    ? 'Release to rebuild project'
                    : 'Build project'
            }
            data-testid="compile-btn"
          >
            {isAIProcessing ? <Icons.Close /> : <Icons.Play />}
            <span className={styles.hideOnMobile}>
              {isAIProcessing
                ? 'Stop Agent'
                : compileStatus === 'building'
                  ? 'Stop Build'
                  : isRebuildReady
                    ? 'Rebuild'
                    : 'Build'}
            </span>
          </button>
        </Tooltip>
      </div>

      <div className={styles.viewTabs}>
        <ToolbarButton
          className={`${styles.tabBtn} ${activeTabId && !isViewTab(activeTabId) ? styles.activeTab : ''}`}
          onClick={handleOpenLastContentTab}
          tooltip="Goto Code"
          aria-label="Goto Code"
          data-testid="code-tab"
          disabled={!lastContentTab}
          showCompletedIcon={false}
        >
          <Icons.Code />
        </ToolbarButton>
        <ToolbarButton
          className={`${styles.tabBtn} ${activeTabId === 'ai-logs' ? styles.activeTab : ''}`}
          onClick={onOpenLog}
          tooltip="Goto Logs"
          shortcut={formatShortcut('⌃U')}
          aria-label="Goto Logs"
          data-testid="logs-tab"
          showCompletedIcon={false}
        >
          <Icons.Terminal />
        </ToolbarButton>
        <ToolbarButton
          className={`${styles.tabBtn} ${activeTabId === 'preview' ? styles.activeTab : ''}`}
          onClick={onOpenPreview}
          tooltip="Goto Preview"
          shortcut={formatShortcut('⌃I')}
          aria-label="Goto Preview"
          data-testid="preview-tab"
          showCompletedIcon={false}
        >
          <Icons.Globe />
        </ToolbarButton>
      </div>
      <ViewSwitcher
        activeView={activeView}
        canOpenCode={Boolean(lastContentTab)}
        onOpenCode={handleOpenLastContentTab}
        onOpenLog={onOpenLog}
        onOpenPreview={onOpenPreview}
      />

      <div className={styles.sidebarToggleGroup}>
        <ToolbarButton
          className={`${styles.sidebarBtn} ${isAIInputActive ? styles.activeSidebar : ''}`}
          onClick={onToggleAIInput}
          tooltip={isAIInputActive ? 'Hide Agent' : 'Show Agent'}
          shortcut={formatShortcut('⌃J')}
          aria-label={isAIInputActive ? 'Hide Agent' : 'Show Agent'}
          data-testid="ai-prompt-toggle"
          showCompletedIcon={false}
        >
          <Icons.AIPrompt />
        </ToolbarButton>
      </div>
    </div>
  );
}
