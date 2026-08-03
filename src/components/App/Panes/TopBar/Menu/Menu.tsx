import { LogState } from '@/components/App/Views/LogArea';
import { createState } from '@/components/state/State';
import type { TopBarMenuStateShape } from '@/components/state/domain-types';
import ContextMenu from '@/components/ui/ContextMenu';
import Dialog from '@/components/ui/Dialog';
import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { formatShortcut } from '@/utils/os';
import { requireStore } from '../../../types';
import type { TopBarMenuProps } from '../topbar-types';
import styles from './Menu.module.css';

const TopBarMenuState = createState<TopBarMenuStateShape>('TopBarMenuState');

export default function TopBarMenu({
  onExportZip,
  onExportCompiledZip,
  onNewProject,
  onClearFS,
  onExportSupportReport,
  onExportAIIncident = () => {},
  hasAIIncident = false,
  onToggleShortcuts,
  onSaveCheckpoint,
  onRestoreCheckpoint,
  hasCheckpoint,
  checkpointHistory,
}: TopBarMenuProps) {
  const { isSystemProcessing, isAIProcessing } = requireStore(
    LogState.useState(['isSystemProcessing', 'isAIProcessing']),
  );
  const topBarMenuState = requireStore(
    TopBarMenuState.useState(null, {
      menuPosition: null,
      newProjectTemplate: null,
      checkpointAction: null,
      checkpointHistoryOpen: false,
      checkpointId: null,
    }),
  );
  const { menuPosition = null, newProjectTemplate = null } = topBarMenuState || {};

  const handleMenuOpen = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    topBarMenuState((draft) => {
      draft.menuPosition = {
        x: rect.right - 220,
        y: rect.bottom + 8,
      };
    });
  };

  const handleMenuClose = () => {
    topBarMenuState((draft) => {
      draft.menuPosition = null;
    });
  };

  const isProcessing = isSystemProcessing || isAIProcessing;

  return (
    <>
      <Tooltip content="More actions">
        <button
          type="button"
          className={`${styles.actionBtn} ${menuPosition ? styles.activeAction : ''}`}
          onClick={handleMenuOpen}
          aria-label="More actions"
          data-testid="more-actions-btn"
        >
          <Icons.MoreVertical />
        </button>
      </Tooltip>
      <ContextMenu position={menuPosition} onClose={handleMenuClose}>
        <button
          type="button"
          className={styles.menuItem}
          disabled={isProcessing}
          onClick={() => {
            topBarMenuState((draft) => {
              draft.newProjectTemplate = 'default';
            });
            handleMenuClose();
          }}
        >
          <Icons.FilePlus />
          <span>New Project</span>
        </button>
        <button
          type="button"
          className={styles.menuItem}
          disabled={isProcessing}
          onClick={() => {
            topBarMenuState((draft) => {
              draft.newProjectTemplate = 'scratch';
            });
            handleMenuClose();
          }}
        >
          <Icons.Code />
          <span>New Project from Scratch</span>
        </button>

        <div className={styles.menuSeparator} />

        <button
          type="button"
          className={styles.menuItem}
          onClick={() => {
            onExportZip();
            handleMenuClose();
          }}
        >
          <Icons.Download />
          <span>Export ZIP</span>
        </button>
        <button
          type="button"
          className={styles.menuItem}
          onClick={() => {
            onExportCompiledZip();
            handleMenuClose();
          }}
        >
          <Icons.Download />
          <span>Export compiled files</span>
        </button>
        <button
          type="button"
          className={styles.menuItem}
          disabled={!hasAIIncident}
          onClick={() => {
            onExportAIIncident();
            handleMenuClose();
          }}
        >
          <Icons.Download />
          <span>Export AI incident</span>
        </button>
        <button
          type="button"
          className={styles.menuItem}
          onClick={() => {
            onExportSupportReport();
            handleMenuClose();
          }}
        >
          <Icons.Download />
          <span>Export support report</span>
        </button>

        <div className={styles.menuSeparator} />

        <button
          type="button"
          className={styles.menuItem}
          onClick={() => {
            void onSaveCheckpoint();
            handleMenuClose();
          }}
        >
          <Icons.Download />
          <span>Save checkpoint</span>
        </button>
        <button
          type="button"
          className={styles.menuItem}
          disabled={!hasCheckpoint || isProcessing}
          onClick={() => {
            topBarMenuState((draft) => {
              draft.checkpointAction = 'restore';
              draft.checkpointId = null;
            });
            handleMenuClose();
          }}
        >
          <Icons.Refresh />
          <span>Restore checkpoint</span>
        </button>
        <button
          type="button"
          className={styles.menuItem}
          disabled={checkpointHistory.length < 2 || isProcessing}
          onClick={() => {
            topBarMenuState((draft) => {
              draft.checkpointHistoryOpen = true;
            });
            handleMenuClose();
          }}
        >
          <Icons.History />
          <span>Checkpoint history</span>
        </button>

        <div className={styles.menuSeparator} />

        <button
          type="button"
          className={styles.menuItem}
          disabled={isProcessing}
          onClick={() => {
            onClearFS();
            handleMenuClose();
          }}
        >
          <Icons.Trash />
          <span>Clear FS</span>
        </button>

        <div className={styles.menuSeparator} />

        <button
          type="button"
          className={styles.menuItem}
          onClick={() => {
            onToggleShortcuts();
            handleMenuClose();
          }}
        >
          <Icons.Info />
          <span>Keyboard Shortcuts</span>
          <span className={styles.menuShortcut}>{formatShortcut('⌃⇧K')}</span>
        </button>
      </ContextMenu>
      <Dialog
        isOpen={!!newProjectTemplate}
        title={newProjectTemplate === 'scratch' ? 'New Project from Scratch?' : 'New Project?'}
        message={
          newProjectTemplate === 'scratch'
            ? 'Are you sure you want to start a new project from scratch? This will unlink the current project and reset all files to a minimal setup.'
            : 'Are you sure you want to start a new project? This will unlink the current project and reset all files to defaults.'
        }
        onConfirm={() => {
          const template = newProjectTemplate;
          topBarMenuState((draft) => {
            draft.newProjectTemplate = null;
          });
          onNewProject(template || 'default');
        }}
        onCancel={() =>
          topBarMenuState((draft) => {
            draft.newProjectTemplate = null;
          })
        }
        confirmText="New Project"
        cancelText="Cancel"
        type="danger"
      />
      <Dialog
        isOpen={topBarMenuState.checkpointAction === 'restore'}
        title="Restore checkpoint?"
        message="The latest checkpoint will replace the current editor buffers, pending diffs, open tabs, and project name."
        onConfirm={() => {
          const checkpointId = topBarMenuState.checkpointId;
          topBarMenuState((draft) => {
            draft.checkpointAction = null;
            draft.checkpointId = null;
          });
          void onRestoreCheckpoint(checkpointId);
        }}
        onCancel={() =>
          topBarMenuState((draft) => {
            draft.checkpointAction = null;
            draft.checkpointId = null;
          })
        }
        confirmText="Restore checkpoint"
        cancelText="Cancel"
        type="danger"
      />
      <Dialog
        isOpen={topBarMenuState.checkpointHistoryOpen === true}
        title="Checkpoint history"
        message="Choose a saved local checkpoint to restore."
        onConfirm={() =>
          topBarMenuState((draft) => {
            draft.checkpointHistoryOpen = false;
          })
        }
        onCancel={() =>
          topBarMenuState((draft) => {
            draft.checkpointHistoryOpen = false;
          })
        }
        confirmText="Close"
        cancelText="Cancel"
      >
        <ul>
          {[...checkpointHistory].reverse().map((checkpoint) => (
            <li key={checkpoint.id || checkpoint.savedAt}>
              <button
                type="button"
                onClick={() =>
                  topBarMenuState((draft) => {
                    draft.checkpointHistoryOpen = false;
                    draft.checkpointAction = 'restore';
                    draft.checkpointId = checkpoint.id || String(checkpoint.savedAt);
                  })
                }
              >
                {checkpoint.projectName || 'Untitled project'} ·{' '}
                {new Date(checkpoint.savedAt).toLocaleString()} ·{' '}
                {checkpoint.reason || 'checkpoint'}
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
