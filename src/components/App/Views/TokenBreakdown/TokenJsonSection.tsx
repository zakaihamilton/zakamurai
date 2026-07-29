import styles from './TokenJsonSection.module.css';
import type { TokenJsonSectionProps } from './token-breakdown-types';

export default function TokenJsonSection({ report }: TokenJsonSectionProps) {
  return (
    <>
      <div className={styles.sectionHeader}>
        <h3>Raw JSON</h3>
        <span>concise report</span>
      </div>
      <pre className={styles.jsonBlock}>{JSON.stringify(report, null, 2)}</pre>
    </>
  );
}
