import { Icons } from '@/components/Core/Base/Icons';
import React from 'react';
import styles from '../TopBar.module.css';

export default function Breadcrumb({ breadcrumb, onBreadcrumbClick }) {
  return (
    <div className={styles.breadcrumb}>
      {breadcrumb.map((seg, i) => (
        <React.Fragment key={breadcrumb.slice(0, i + 1).join('/')}>
          <button
            type="button"
            onClick={() => onBreadcrumbClick(seg, i)}
            onKeyDown={(e) => e.key === 'Enter' && onBreadcrumbClick(seg, i)}
            className={`${styles.breadcrumbSegment} ${i === breadcrumb.length - 1 ? styles.active : ''}`}
          >
            {seg === 'Zakamurai' ? (
              <>
                Zakamur<span className={styles.aiHighlight}>ai</span>
              </>
            ) : (
              seg
            )}
          </button>
          {i < breadcrumb.length - 1 && <Icons.ChevronRight />}
        </React.Fragment>
      ))}
    </div>
  );
}
