import { Icons } from '@/components/Core/Base/Icons';
import React from 'react';
import styles from '../App.module.css';

export default function AppLoading() {
  return (
    <div className={styles.loadingContainer}>
      <div className={styles.loadingContent}>
        <div className={styles.logoWrapper}>
          <Icons.ZLogo size={64} className={styles.loadingLogo} />
          <div className={styles.logoGlow} />
        </div>
        <div className={styles.loadingText}>
          <h2>Zakamurai</h2>
          <div className={styles.progressTrack}>
            <div className={styles.progressBar} />
          </div>
          <p>Initializing workspace...</p>
        </div>
      </div>
    </div>
  );
}
