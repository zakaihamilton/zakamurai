import { Icons } from '@/components/ui/Icons';
import styles from './Hero.module.css';

export default function WelcomeHero() {
  return (
    <>
      <div className={styles.logoMark}>
        <Icons.ZLogo size={56} className={styles.logo} />
      </div>
      <p className={styles.eyebrow}>Zero setup. Full workspace.</p>
      <h1 className={styles.title}>Go from idea to running app—right in your browser.</h1>
      <p className={styles.subtitle}>
        Edit code, collaborate with private local AI, build in the browser, and preview the result
        without configuring a local environment.
      </p>

      <p className={styles.intro}>
        <span>Open</span>
        <span className={styles.introSep} aria-hidden="true">
          ·
        </span>
        <span>Edit</span>
        <span className={styles.introSep} aria-hidden="true">
          ·
        </span>
        <span>Prompt</span>
        <span className={styles.introSep} aria-hidden="true">
          ·
        </span>
        <span>Build</span>
        <span className={styles.introSep} aria-hidden="true">
          ·
        </span>
        <span>Preview</span>
      </p>
    </>
  );
}
