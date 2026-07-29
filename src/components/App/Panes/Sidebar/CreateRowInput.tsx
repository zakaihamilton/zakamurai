import { Icons } from '@/components/ui/Icons';
import React, { useEffect, useRef } from 'react';
import { requireStore } from '../../types';
import styles from './CreateRowInput.module.css';
import { TreeItemState } from './TreeItem';
import type { CreateRowInputProps } from './sidebar-types';

export default function CreateRowInput({ row, onCreate, onCancelCreate }: CreateRowInputProps) {
  const { level = 0, createType, parentRow } = row;
  const createRowState = requireStore(TreeItemState.useState(null, { createValue: '' }));
  const { createValue = '' } = createRowState || {};
  const createInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    createInputRef.current?.focus();
  }, []);

  const submitCreate = async () => {
    const nextName = createValue.trim();
    if (nextName) {
      const created = await onCreate(parentRow, createType || 'file', nextName);
      if (!created) return;
    }
    onCancelCreate();
  };

  return (
    <div
      style={{ ['--tree-indent' as string]: `${16 + level * 16}px` }}
      className={styles.createInputContainer}
    >
      <span className={styles.iconContainer} />
      <span className={styles.typeIcon}>
        {createType === 'folder' ? <Icons.Folder /> : <Icons.File />}
      </span>
      <input
        ref={createInputRef}
        value={createValue}
        onChange={(event) =>
          createRowState((draft) => {
            draft.createValue = event.target.value;
          })
        }
        onBlur={submitCreate}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submitCreate();
          if (event.key === 'Escape') onCancelCreate();
        }}
        className={styles.editInput}
      />
    </div>
  );
}
