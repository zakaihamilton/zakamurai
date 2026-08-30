import styles from './IsolationBanner.module.css';

export default function IsolationBanner({ message }: { message: string }) {
  return (
    <output className={styles.banner} aria-live="polite">
      {message}
    </output>
  );
}
