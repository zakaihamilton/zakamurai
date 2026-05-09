import React, { useState } from 'react';
import ContextMenu from '../../../Widgets/ContextMenu/ContextMenu';
import Dialog from '../../../Widgets/Dialog/Dialog';
import Tooltip from '../../../Widgets/Tooltip/Tooltip';
import { Icons } from '../../Icons';
import styles from '../TopBar.module.css';

export default function TopBarMenu({
  onExportZip,
  onExportCompiledZip,
  onStartOver,
  onClearFS,
  isProcessing,
}) {
  const [menuPosition, setMenuPosition] = useState(null);
  const [isStartOverDialogOpen, setIsStartOverDialogOpen] = useState(false);

  const handleMenuOpen = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({
      x: rect.right - 220,
      y: rect.bottom + 8,
    });
  };

  const handleMenuClose = () => {
    setMenuPosition(null);
  };

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
            setIsStartOverDialogOpen(true);
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
      </ContextMenu>
      <Dialog
        isOpen={isStartOverDialogOpen}
        title="Start Over?"
        message="Are you sure you want to start over? This will unlink the project and reset all files to defaults."
        onConfirm={() => {
          setIsStartOverDialogOpen(false);
          onStartOver();
        }}
        onCancel={() => setIsStartOverDialogOpen(false)}
        confirmText="Start Over"
        cancelText="Cancel"
        type="danger"
      />
    </>
  );
}
