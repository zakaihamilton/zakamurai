import styles from './inline-style-violation.module.css';

export function BadCard({ label }: { label: string }) {
  return (
    <div className={styles.card} style={{ color: 'red' }}>
      {label}
    </div>
  );
}
