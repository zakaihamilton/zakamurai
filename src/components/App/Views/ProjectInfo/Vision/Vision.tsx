import { Icons } from '@/components/ui/Icons';
import styles from './Vision.module.css';

export default function ProjectVision() {
  return (
    <section className={styles.section}>
      <h2>
        <Icons.Brain size={24} /> The Vision
      </h2>
      <p>
        The best tools reduce the distance between an idea and a working experiment. Zakamurai aims
        to make that loop feel immediate: humans set the direction, local tools handle the friction,
        and every suggested change stays reviewable before it becomes part of the project.
      </p>
    </section>
  );
}
