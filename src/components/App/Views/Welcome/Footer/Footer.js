import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import React from 'react';
import styles from './Footer.module.css';

export default function WelcomeFooter() {
  return (
    <footer className={styles.footer}>
      <span className={styles.footerText}>Zakai Hamilton</span>
      <Tooltip content="GitHub Repository">
        <a
          href="https://github.com/zakaihamilton/zakamurai"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.githubLink}
        >
          <Icons.Github size={18} />
        </a>
      </Tooltip>
      <Tooltip content="LinkedIn Profile">
        <a
          href="https://www.linkedin.com/in/zakai-hamilton"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.linkedinLink}
        >
          <Icons.Linkedin size={18} />
        </a>
      </Tooltip>
    </footer>
  );
}
