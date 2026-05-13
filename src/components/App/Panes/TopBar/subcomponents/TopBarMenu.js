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
  onNewProject,
  onClearFS,
  isSystemProcessing,
  isAIProcessing,
  onToggleShortcuts,
}) {
  const topBarMenuState = TopBarMenuState.useState(null, {
    menuPosition: null,
    newProjectTemplate: null,
  });
  const { menuPosition = null, newProjectTemplate = null } = topBarMenuState || {};

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
          onNewProject(template);
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
    </>
  );
}
