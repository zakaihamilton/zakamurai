import { Icons } from '@/components/Core/Base/Icons';
import { createState } from '@/components/Core/Base/State';
import ContextMenu from '@/components/Widgets/ContextMenu/ContextMenu';
import Dialog from '@/components/Widgets/Dialog/Dialog';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { formatShortcut } from '@/utils/os';
import styles from '../TopBar.module.css';

const TopBarMenuState = createState('TopBarMenuState');

export default function TopBarMenu({
  onExportZip,
  onExportCompiledZip,
  onStartOver,
  onClearFS,
  isSystemProcessing,
  isAIProcessing,
  onToggleShortcuts,
}) {
  const topBarMenuState = TopBarMenuState.useState(null, {
    menuPosition: null,
    isStartOverDialogOpen: false,
  });
  const { menuPosition = null, isStartOverDialogOpen = false } = topBarMenuState || {};

  const handleMenuOpen = (e) => {
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
          className={`${styles.actionBtn} ${menuPosition ? styles.active : ''}`}
          onClick={handleMenuOpen}
        >
          <Icons.MoreVertical />
        </button>
      </Tooltip>
      <ContextMenu position={menuPosition} onClose={handleMenuClose}>
        <button
          type="button"
          className={styles.menuItem}
          onClick={() => {
            onExportZip();
            handleMenuClose();
          }}
        >
          <Icons.Plus />
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
          <Icons.Play />
          <span>Export compiled files</span>
        </button>
        <button
          type="button"
          className={styles.menuItem}
          disabled={isProcessing}
          onClick={() => {
            topBarMenuState((draft) => {
              draft.isStartOverDialogOpen = true;
            });
            handleMenuClose();
          }}
        >
          <Icons.Refresh />
          <span>Start over</span>
        </button>
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
        isOpen={isStartOverDialogOpen}
        title="Start Over?"
        message="Are you sure you want to start over? This will unlink the project and reset all files to defaults."
        onConfirm={() => {
          topBarMenuState((draft) => {
            draft.isStartOverDialogOpen = false;
          });
          onStartOver();
        }}
        onCancel={() =>
          topBarMenuState((draft) => {
            draft.isStartOverDialogOpen = false;
          })
        }
        confirmText="Start Over"
        cancelText="Cancel"
        type="danger"
      />
    </>
  );
}
