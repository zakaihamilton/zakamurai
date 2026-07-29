import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { getFileViews } from '@/utils/fileViews';
import React from 'react';
import type { FileViewToolbarProps } from './file-view-toolbar-types';
import styles from './FileViewToolbar.module.css';

type IconName = keyof typeof Icons;

const ViewIcon = ({ icon }: { icon: string }) => {
  const Icon = Icons[icon as IconName] || Icons.File;
  return <Icon size={14} />;
};

export default function FileViewToolbar({
  fileName,
  activeViewType,
  onSelectView,
}: FileViewToolbarProps) {
  const views = getFileViews(fileName);
  if (views.length <= 1) return null;

  return (
    <div className={styles.viewSwitch} aria-label="Open with">
      {views.map((view) => (
        <Tooltip key={view.id} content={`Open with ${view.label}`}>
          <button
            type="button"
            className={`${styles.viewButton} ${activeViewType === view.id ? styles.active : ''}`}
            onClick={() => onSelectView(view.id)}
            aria-label={`Open with ${view.label}`}
            aria-pressed={activeViewType === view.id}
          >
            <ViewIcon icon={view.icon} />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
