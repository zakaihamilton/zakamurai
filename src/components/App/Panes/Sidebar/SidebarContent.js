import React from 'react';
import styles from './Sidebar.module.css';

/** Presentational sidebar composition; controller-provided props contain all store actions. */
export default function SidebarContent({ isMobile, isOpen, desktopWidth, children }) {
  return (
    <aside
      className={[styles.sidebar, isOpen ? styles.isOpen : ''].filter(Boolean).join(' ')}
      aria-hidden={!isOpen}
      style={isMobile ? undefined : { '--panel-width': desktopWidth }}
    >
      {children}
    </aside>
  );
}
