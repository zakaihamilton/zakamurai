import styles from './good-css-module.module.css';

export function GoodCard({ label }: { label: string }) {
  return <div className={styles.card}>{label}</div>;
}
