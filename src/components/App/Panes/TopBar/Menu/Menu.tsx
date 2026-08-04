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
  onToggleShortcuts,
}: TopBarMenuProps) {
  const { isSystemProcessing, isAIProcessing } = requireStore(
    LogState.useState(['isSystemProcessing', 'isAIProcessing']),
  );
  const topBarMenuState = requireStore(
    TopBarMenuState.useState(null, {
      menuPosition: null,
      confirmNewProject: false,
    }),
  );
  const { menuPosition = null, confirmNewProject = false } = topBarMenuState || {};

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
              draft.confirmNewProject = true;
            });
            handleMenuClose();
          }}
        >
          <Icons.FilePlus />
          <span>New Project</span>
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
        isOpen={confirmNewProject}
        title="New Project?"
        message="Are you sure you want to start a new project? This will unlink the current project and reset all files to a minimal setup."
        onConfirm={() => {
          topBarMenuState((draft) => {
            draft.confirmNewProject = false;
          });
          onNewProject('scratch');
        }}
        onCancel={() =>
          topBarMenuState((draft) => {
            draft.confirmNewProject = false;
          })
        }
        confirmText="New Project"
        cancelText="Cancel"
        type="danger"
      />
    </>
  );
}
