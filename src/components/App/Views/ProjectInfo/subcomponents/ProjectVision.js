import { Icons } from '@/components/ui/Icons';
import React from 'react';
import styles from '../ProjectInfo.module.css';

export default function ProjectVision() {
  return (
    <section className={styles.section}>
      <h2>
        <Icons.Brain size={24} /> The Vision
      </h2>
      <p>
        We believe the future of coding is collaborative, not just between humans, but between
        developers and intelligent agents. Zakamurai is our step toward that future—a workspace
        where the boundary between your thoughts and your code is thinner than ever.
      </p>
    </section>
  );
}
