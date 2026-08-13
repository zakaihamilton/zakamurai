import { RagState } from '@/components/AI/RagState';
import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { getCompletionStatusMessage } from '@/components/App/Views/EditorArea/completionUtils';
import { purgeSystemMemory } from '@/components/Performance';
import { useFileSystem } from '@/components/Storage';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { setInDraft } from '@/utils/StateUtils';
import { useState } from 'react';
import { requireStore } from '../../types';
import styles from './StatusBar.module.css';

export default function StatusBar() {
  const [isPurging, setIsPurging] = useState(false);
  const { theme, projectName } = requireStore(AppState.useState(['theme', 'projectName']));
  const fs = useFileSystem();

  const handleFreeMemory = async () => {
    setIsPurging(true);
    try {
      await purgeSystemMemory();
    } finally {
      setTimeout(() => setIsPurging(false), 1200);
    }
  };

  const editorState = requireStore(
    EditorState.useState([
      'cursorPos',
      'isCompleting',
      'aiCompletionEnabled',
      'aiCompletionDebug',
      'completionActivity',
    ]),
  );
  const tabState = requireStore(TabState.useState(['activeTabId', 'openTabs']));
  const { status: ragStatus } = requireStore(RagState.useState(['status']));
  const { activeTabId, openTabs = [] } = tabState;
  const activeTab = openTabs.find((t) => t.id === activeTabId);
  const { cursorPos = {} } = editorState;

  const currentCursor = (activeTabId ? cursorPos[activeTabId] : undefined) || { line: 1, col: 1 };
  const { line, col } = currentCursor;
  const isCompleting = activeTabId ? editorState.isCompleting?.[activeTabId] : undefined;
  const aiCompletionEnabled = editorState.aiCompletionEnabled === true;
  const completionDebug = editorState.aiCompletionDebug;
  const completionActivityState = activeTabId
    ? editorState.completionActivity?.[activeTabId]
    : undefined;
  const completionError =
    completionDebug?.status === 'error' && completionDebug?.filePath === activeTabId
      ? completionDebug.error
      : '';
  const completionActivity = getCompletionStatusMessage(
    completionActivityState
      ? {
          phase:
            typeof completionActivityState.phase === 'string'
              ? completionActivityState.phase
              : undefined,
          model:
            typeof completionActivityState.model === 'string'
              ? completionActivityState.model
              : undefined,
        }
      : null,
    !!isCompleting,
  );
  const aiStatusLabel = !aiCompletionEnabled
    ? 'AI Off'
    : isCompleting
      ? 'Thinking...'
      : completionError
        ? 'AI Error'
        : 'AI Ready';
  const aiTooltip = !aiCompletionEnabled
    ? 'AI completion is off. Tap to turn it on.'
    : isCompleting
      ? `${completionActivity} Press Esc to cancel.`
      : completionError
        ? completionError
        : 'AI completion is on. Tap to turn it off.';

  const toggleAICompletion = () => {
    editorState((draft) => {
      draft.aiCompletionEnabled = draft.aiCompletionEnabled !== true;
      if (!draft.aiCompletionEnabled && draft.isCompleting && activeTabId) {
        setInDraft(draft, ['isCompleting', activeTabId], false);
      }
    });
  };

  const encoding = 'UTF-8';
  const language =
    activeTab?.type === 'logs'
      ? 'System Log'
      : activeTab?.type === 'preview'
        ? 'Preview'
        : activeTabId?.endsWith('.js') || activeTabId?.endsWith('.jsx')
          ? 'JavaScript'
          : activeTabId?.endsWith('.ts') || activeTabId?.endsWith('.tsx')
            ? 'TypeScript'
            : activeTabId?.endsWith('.css')
              ? 'CSS'
              : activeTabId?.endsWith('.html')
                ? 'HTML'
                : activeTabId?.endsWith('.json')
                  ? 'JSON'
                  : activeTabId?.endsWith('.md')
                    ? 'Markdown'
                    : 'Plain Text';

  return (
    <footer className={`${styles.statusBar} ${theme === 'light' ? styles.light : ''}`}>
      <div className={styles.left}>
        <Tooltip content={`Project: ${projectName}`} className={styles.tooltipWrapper}>
          <div className={styles.item}>
            <Icons.Folder size={14} />
            <span>{projectName}</span>
          </div>
        </Tooltip>
        <Tooltip
          content={
            fs.mode === 'local'
              ? 'Local folder (File System Access API)'
              : 'Browser storage (default). Open a local folder for larger projects.'
          }
          className={styles.tooltipWrapper}
        >
          <output
            className={styles.item}
            aria-label={
              fs.mode === 'local'
                ? 'Storage: local folder'
                : 'Storage: browser (virtual filesystem)'
            }
          >
            <Icons.Globe size={14} />
            <span>{fs.mode === 'local' ? 'Local' : 'Virtual'}</span>
          </output>
        </Tooltip>
        {ragStatus && ragStatus !== 'idle' && (
          <Tooltip content={`RAG index: ${ragStatus}`} className={styles.tooltipWrapper}>
            <div className={styles.item}>
              <span>RAG: {ragStatus}</span>
            </div>
          </Tooltip>
        )}
        <Tooltip
          content="Unload local LLMs, purge vector models and free browser RAM"
          className={styles.tooltipWrapper}
        >
          <button
            type="button"
            className={styles.item}
            onClick={handleFreeMemory}
            disabled={isPurging}
            aria-label="Free browser memory"
          >
            <Icons.Trash size={14} />
            <span>{isPurging ? 'Purging…' : 'Free Memory'}</span>
          </button>
        </Tooltip>
      </div>

      <div className={styles.right}>
        {activeTab && (
          <>
            <div className={styles.item}>
              <span>
                Ln {line}, Col {col}
              </span>
            </div>
            <div className={`${styles.item} ${styles.hideOnMobile}`}>
              <span>Spaces: 2</span>
            </div>
            <div className={`${styles.item} ${styles.hideOnMobile}`}>
              <span>{encoding}</span>
            </div>
            <Tooltip content={aiTooltip}>
              <button
                type="button"
                className={`${styles.item} ${styles.aiItem} ${
                  aiCompletionEnabled ? styles.aiItemActive : styles.aiItemDisabled
                } ${isCompleting ? styles.thinking : ''} ${
                  completionError ? styles.aiItemError : ''
                }`}
                onClick={toggleAICompletion}
                aria-pressed={aiCompletionEnabled}
                aria-label={
                  aiCompletionEnabled ? 'Turn AI completion off' : 'Turn AI completion on'
                }
              >
                <Icons.BotSmall />
                <span>{aiStatusLabel}</span>
              </button>
            </Tooltip>
            <div className={styles.item}>
              <Icons.BotSmall size={14} />
              <span className={styles.hideOnMobile}>{language}</span>
            </div>
          </>
        )}
      </div>
    </footer>
  );
}
