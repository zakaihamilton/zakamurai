import React from 'react';
import styles from './SidebarContent.module.css';

/** Presentational sidebar composition; controller-provided props contain all store actions. */
export default function SidebarContent({ isMobile, isOpen, desktopWidth, children }) {
  return (
    <aside
      className={`${styles.sidebar} ${isOpen ? styles.isOpen : ''}`}
      aria-hidden={!isOpen}
      style={isMobile ? undefined : { '--panel-width': desktopWidth }}
    >
      <div className={styles.contentWrapper}>{children}</div>
    </aside>
  );
}
