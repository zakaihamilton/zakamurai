import { Icons } from '@/components/ui/Icons';
import styles from './TokenBreakdown.module.css';

export default function TokenSummaryCards({ report }) {
  return (
    <section className={styles.summaryGrid} aria-label="Token breakdown summary">
      <div className={`${styles.summaryCard} ${styles.summaryMode}`}>
        <div className={styles.summaryCardHeader}>
          <span className={styles.summaryCardTitle}>Mode</span>
          <span className={styles.summaryCardIcon}>
            <Icons.Code size={14} />
          </span>
        </div>
        <strong className={styles.summaryCardValue}>{report.languageMode}</strong>
      </div>
      <div className={`${styles.summaryCard} ${styles.summaryTokens}`}>
        <div className={styles.summaryCardHeader}>
          <span className={styles.summaryCardTitle}>Tokens</span>
          <span className={styles.summaryCardIcon}>
            <Icons.Tokens size={14} />
          </span>
        </div>
        <strong className={styles.summaryCardValue}>{report.tokens.length}</strong>
      </div>
      <div className={`${styles.summaryCard} ${styles.summaryLines}`}>
        <div className={styles.summaryCardHeader}>
          <span className={styles.summaryCardTitle}>Lines</span>
          <span className={styles.summaryCardIcon}>
            <Icons.Terminal size={14} />
          </span>
        </div>
        <strong className={styles.summaryCardValue}>{report.lineCount}</strong>
      </div>
      <div className={`${styles.summaryCard} ${styles.summaryFolds}`}>
        <div className={styles.summaryCardHeader}>
          <span className={styles.summaryCardTitle}>Folds</span>
          <span className={styles.summaryCardIcon}>
            <Icons.ChevronDown />
          </span>
        </div>
        <strong className={styles.summaryCardValue}>{report.folds.length}</strong>
      </div>
      <div className={`${styles.summaryCard} ${styles.summaryNav}`}>
        <div className={styles.summaryCardHeader}>
          <span className={styles.summaryCardTitle}>Nav Targets</span>
          <span className={styles.summaryCardIcon}>
            <Icons.Globe size={14} />
          </span>
        </div>
        <strong className={styles.summaryCardValue}>{report.navigationTargets.length}</strong>
      </div>
      <div className={`${styles.summaryCard} ${styles.summarySearch}`}>
        <div className={styles.summaryCardHeader}>
          <span className={styles.summaryCardTitle}>Search Matches</span>
          <span className={styles.summaryCardIcon}>
            <Icons.Search size={14} />
          </span>
        </div>
        <strong className={styles.summaryCardValue}>{report.search.matchCount}</strong>
      </div>
    </section>
  );
}
