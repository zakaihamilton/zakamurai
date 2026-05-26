import { Icons } from '@/components/Core/Base/Icons';
import Tooltip from '@/components/Widgets/Tooltip/Tooltip';
import { getFileViews } from '@/utils/fileViews';
import React from 'react';
import styles from './FileViewToolbar.module.css';

const ViewIcon = ({ icon }) => {
  const Icon = Icons[icon] || Icons.File;
  return <Icon size={14} />;
};

export default function FileViewToolbar({ fileName, activeViewType, onSelectView }) {
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
