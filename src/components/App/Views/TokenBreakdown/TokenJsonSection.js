import styles from './TokenJsonSection.module.css';

export default function TokenJsonSection({ report }) {
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
