import styles from './Header.module.css';

export default function ProjectHeader() {
  return (
    <header className={styles.header}>
      <span className={styles.eyebrow}>Browser IDE · local AI · instant preview</span>
      <h1 className={styles.title}>Zakamurai</h1>
      <p className={styles.pitch}>
        Build, review, and preview web projects in your browser—with a focused editor and private AI
        collaboration close at hand.
      </p>
    </header>
  );
}
