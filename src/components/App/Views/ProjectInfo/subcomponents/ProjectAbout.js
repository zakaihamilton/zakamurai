import { Icons } from '@/components/ui/Icons';
import React from 'react';
import styles from '../ProjectInfo.module.css';

export default function ProjectAbout() {
  return (
    <section className={styles.section}>
      <div className={styles.explanation}>
        <h2>
          <Icons.Sparkles size={24} /> About the Project
        </h2>
        <p>
          Zakamurai is a next-generation, browser-based Integrated Development Environment (IDE)
          designed from the ground up for speed and AI-assisted creativity. It eliminates the
          traditional setup hurdles of local development environments, allowing developers to start
          coding the moment they open their browser.
        </p>
        <p>
          Whether you are prototyping a new idea or building a complex web application, Zakamurai
          provides the tools you need: a high-performance code editor, real-time compilation, a live
          preview area, and an integrated AI that understands your project's context to help you
          write better code faster.
        </p>
      </div>
    </section>
  );
}
