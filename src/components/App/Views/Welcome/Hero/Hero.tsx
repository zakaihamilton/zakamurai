import { Icons } from '@/components/ui/Icons';
import styles from './Hero.module.css';

export default function WelcomeHero() {
  return (
    <>
      <div className={styles.logoMark}>
        <Icons.ZLogo size={56} className={styles.logo} />
      </div>
      <p className={styles.eyebrow}>Welcome to Zakamurai</p>
      <h1 className={styles.title}>Your AI coding workspace in the browser.</h1>
      <p className={styles.subtitle}>
        A focused browser workspace for editing, AI-assisted changes, builds, logs, and live
        preview.
      </p>

      <div className={styles.intro}>
        <span>Code</span>
        <span>Prompt</span>
        <span>Build</span>
        <span>Preview</span>
      </div>
    </>
  );
}
