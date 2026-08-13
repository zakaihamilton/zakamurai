import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import type { NavigationHistory } from '@/types/domain-types';
import { formatShortcut } from '@/utils/os';
import { useEffect, useRef, useState } from 'react';
import { requireStore } from '../../../types';
import HistoryDropdown from '../HistoryDropdown';
import styles from './NavigationControls.module.css';

export default function NavigationControls() {
  const tabState = TabState.usePassiveState();
  const editorState = requireStore(EditorState.useState(['navigationHistory', 'fileContents']));

  const history: NavigationHistory = editorState.navigationHistory || {
    stack: [],
    currentIndex: -1,
  };
  const canGoBack = history.currentIndex > 0;
  const canGoForward = history.currentIndex < history.stack.length - 1;

  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowHistoryDropdown(false);
      }
    };
    if (showHistoryDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showHistoryDropdown]);

  const handleClearHistory = () => {
    editorState((draft) => {
      draft.navigationHistory = { stack: [], currentIndex: -1 };
    });
    setShowHistoryDropdown(false);
  };

  const navigateToHistoryItem = (nextIndex: number) => {
    if (!tabState || !editorState) return;
    if (!history || !history.stack) return;
    const item = history.stack[nextIndex];
    if (!item) return;

    const targetPath = item.filePath;
    const targetLoc = item.loc;
    const targetContent = editorState.fileContents?.[targetPath] ?? '';

    const fileName = targetPath.substring(targetPath.lastIndexOf('/') + 1);
    const fileObj = {
      name: fileName,
      path: targetPath.split('/'),
      content: targetContent,
    };
    const newTab = {
      id: targetPath,
      type: 'file' as const,
      label: fileName,
      file: fileObj,
    };

    tabState((draft) => {
      const existingTab = draft.openTabs.find((t) => t.id === targetPath);
      if (!existingTab) {
        draft.openTabs = [...draft.openTabs, newTab];
      }
      draft.activeTabId = targetPath;
    });

    editorState((draft) => {
      draft.cursorPos = {
        ...(draft.cursorPos || {}),
        [targetPath]: targetLoc as import('@/types/domain-types').CursorPosition,
      };
      draft.shouldScrollTo = {
        filePath: targetPath,
        line: targetLoc.line,
        timestamp: Date.now(),
      };
      if (draft.navigationHistory) {
        draft.navigationHistory = {
          ...draft.navigationHistory,
          currentIndex: nextIndex,
        };
      }
    });
  };

  const handleItemClick = (index: number) => {
    if (!tabState) return;
    navigateToHistoryItem(index);
    setShowHistoryDropdown(false);
  };

  const prevItem = canGoBack ? history.stack[history.currentIndex - 1] : null;
  const nextItem = canGoForward ? history.stack[history.currentIndex + 1] : null;

  const backTooltip = prevItem ? `Go Back to ${prevItem.label}:${prevItem.loc.line}` : 'Go Back';
  const forwardTooltip = nextItem
    ? `Go Forward to ${nextItem.label}:${nextItem.loc.line}`
    : 'Go Forward';

  const handleGoBack = () => {
    if (canGoBack) {
      navigateToHistoryItem(history.currentIndex - 1);
    }
  };

  const handleGoForward = () => {
    if (canGoForward) {
      navigateToHistoryItem(history.currentIndex + 1);
    }
  };

  return (
    <div className={styles.navigationControls} ref={dropdownRef}>
      <Tooltip content={backTooltip} shortcut={formatShortcut('Alt+ArrowLeft')}>
        <button
          type="button"
          className={`${styles.navButton} ${!canGoBack ? styles.disabled : ''}`}
          onClick={handleGoBack}
          disabled={!canGoBack}
          aria-label="Go Back"
          data-testid="go-back-button"
        >
          <Icons.ChevronLeft />
        </button>
      </Tooltip>

      <div className={styles.historyWrapper}>
        <Tooltip content="History">
          <button
            type="button"
            className={`${styles.navButton} ${history.stack.length === 0 ? styles.disabled : ''} ${showHistoryDropdown ? styles.activeNav : ''}`}
            onClick={() => {
              if (history.stack.length > 0) {
                setShowHistoryDropdown(!showHistoryDropdown);
              }
            }}
            disabled={history.stack.length === 0}
            aria-label="Navigation History"
            data-testid="history-dropdown-button"
          >
            <Icons.History />
          </button>
        </Tooltip>

        <HistoryDropdown
          isOpen={showHistoryDropdown}
          onClose={() => setShowHistoryDropdown(false)}
          history={history}
          onItemClick={handleItemClick}
          onClearHistory={handleClearHistory}
        />
      </div>

      <Tooltip content={forwardTooltip} shortcut={formatShortcut('Alt+ArrowRight')}>
        <button
          type="button"
          className={`${styles.navButton} ${!canGoForward ? styles.disabled : ''}`}
          onClick={handleGoForward}
          disabled={!canGoForward}
          aria-label="Go Forward"
          data-testid="go-forward-button"
        >
          <Icons.ChevronRight />
        </button>
      </Tooltip>
    </div>
  );
}
