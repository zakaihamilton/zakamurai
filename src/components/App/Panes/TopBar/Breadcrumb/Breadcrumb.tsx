import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import type { BreadcrumbProps } from '../topbar-types';
import styles from './Breadcrumb.module.css';

export default function Breadcrumb({ breadcrumb, onBreadcrumbClick }: BreadcrumbProps) {
  return (
    <nav className={styles.breadcrumb} aria-label="Breadcrumb">
      {breadcrumb.map((seg, i) => (
        <span key={breadcrumb.slice(0, i + 1).join('/')}>
          <Tooltip content={seg} className={styles.segmentTooltip}>
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
          </Tooltip>
          {i < breadcrumb.length - 1 && <Icons.ChevronRight />}
        </span>
      ))}
    </nav>
  );
}
