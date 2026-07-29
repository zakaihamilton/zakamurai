import styles from './TokenFoldsSection.module.css';
import type { TokenFoldsSectionProps } from './token-breakdown-types';

export default function TokenFoldsSection({
  folds,
  foldLabel,
  collapsedFoldIds,
}: TokenFoldsSectionProps) {
  return (
    <>
      <div className={styles.sectionHeader}>
        <h3>Folds</h3>
        <span>{foldLabel}</span>
      </div>
      {folds.length > 0 ? (
        <ul className={styles.detailList}>
          {folds.map((fold) => (
            <li key={fold.id}>
              <code>{fold.id}</code>
              <span>
                {foldLabel}: {fold.startLine}-{fold.endLine}
                {collapsedFoldIds.includes(fold.id) ? ' collapsed' : ''}
                {fold.placeholder ? ` ${fold.placeholder}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No folds detected.</p>
      )}
    </>
  );
}
