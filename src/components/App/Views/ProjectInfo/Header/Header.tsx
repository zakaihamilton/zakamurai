import React from 'react';
import styles from './Header.module.css';

export default function ProjectHeader() {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>Zakamurai</h1>
      <p className={styles.pitch}>
        "The ultimate browser-based coding companion that blends a powerful IDE experience with
        seamless AI collaboration. Stop switching between tools and start building instantly."
      </p>
    </header>
  );
}
