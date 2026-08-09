import { Icons } from '@/components/ui/Icons';
import ToolbarButton from '@/components/ui/ToolbarButton';
import { getFileViews } from '@/utils/fileViews';
import styles from './FileViewToolbar.module.css';
import type { FileViewToolbarProps } from './file-view-toolbar-types';

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
        <ToolbarButton
          key={view.id}
          className={`${styles.viewButton} ${activeViewType === view.id ? styles.active : ''}`}
          onClick={() => onSelectView(view.id)}
          tooltip={`Open with ${view.label}`}
          aria-label={`Open with ${view.label}`}
          aria-pressed={activeViewType === view.id}
        >
          <ViewIcon icon={view.icon} />
        </ToolbarButton>
      ))}
    </div>
  );
}
