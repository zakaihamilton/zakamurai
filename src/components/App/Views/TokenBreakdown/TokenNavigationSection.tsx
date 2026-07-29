import styles from './TokenNavigationSection.module.css';
import type { TokenNavigationSectionProps } from './token-breakdown-types';

export default function TokenNavigationSection({
  navigationTargets,
  navigationLinksEnabled,
}: TokenNavigationSectionProps) {
  return (
    <>
      <div className={styles.sectionHeader}>
        <h3>Navigation Targets</h3>
        <span>{navigationLinksEnabled ? 'enabled' : 'disabled'}</span>
      </div>
      {navigationTargets.length > 0 ? (
        <ul className={styles.detailList}>
          {navigationTargets.map((target, index) => (
            <li key={`${target.start}-${target.end}-${target.name || target.className || index}`}>
              <code>{target.type || 'target'}</code>
              <span>
                {target.name || target.className || 'unnamed'} at {target.position?.line || '-'}:
                {target.position?.column || '-'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No navigation targets detected.</p>
      )}
    </>
  );
}
