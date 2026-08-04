import { Icons } from '@/components/ui/Icons';
import styles from './Hero.module.css';

export default function WelcomeHero() {
  return (
    <>
      <div className={styles.logoMark}>
        <Icons.ZLogo size={56} className={styles.logo} />
      </div>
      <p className={styles.eyebrow}>Welcome to Zakamurai</p>
      <h1 className={styles.title}>Your AI coding workspace in the browser</h1>
      <p className={styles.subtitle}>
        Edit, prompt, build, and preview — all in one focused place.
      </p>

      <p className={styles.intro}>
        <span>Code</span>
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
