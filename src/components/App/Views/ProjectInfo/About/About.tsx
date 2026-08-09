import { Icons } from '@/components/ui/Icons';
import styles from './About.module.css';

export default function ProjectAbout() {
  return (
    <section className={styles.section}>
      <div className={styles.explanation}>
        <h2>
          <Icons.Sparkles size={24} /> About the Project
        </h2>
        <p>
          Zakamurai is a browser-based development workspace for turning an idea into a working web
          project without a local setup. Open the app, edit files, ask for help, and see the result
          in a live preview—all in the same focused loop.
        </p>
        <p>
          Projects, builds, and local AI models stay in the browser. IndexedDB is used when
          available, with localStorage as a fallback, so the workspace remains private and useful
          without a backend service.
        </p>
      </div>
    </section>
  );
}
