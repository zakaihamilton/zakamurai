import styles from './Header.module.css';

export default function ProjectHeader() {
  return (
    <header className={styles.header}>
      <span className={styles.eyebrow}>Zero setup · local-first · browser-native</span>
      <h1 className={styles.title}>Zakamurai</h1>
      <p className={styles.pitch}>
        A professional browser workspace for building web projects without a local environment.
        Edit, review, build, and preview with private AI collaboration close at hand.
      </p>
    </header>
  );
}
