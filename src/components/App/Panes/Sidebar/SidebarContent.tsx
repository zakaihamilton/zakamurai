import type { CssCustomProperties } from '@/components/App/types';
import type { SidebarContentProps } from './sidebar-types';
import styles from './SidebarContent.module.css';

/** Presentational sidebar composition; controller-provided props contain all store actions. */
export default function SidebarContent({
  isMobile,
  isOpen,
  desktopWidth,
  children,
}: SidebarContentProps) {
  return (
    <aside
      className={`${styles.sidebar} ${isOpen ? styles.isOpen : ''}`}
      aria-hidden={!isOpen}
      style={isMobile ? undefined : ({ '--panel-width': desktopWidth } as CssCustomProperties)}
    >
      <div className={styles.contentWrapper}>{children}</div>
    </aside>
  );
}
