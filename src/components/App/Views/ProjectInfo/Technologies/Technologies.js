import { Icons } from '@/components/ui/Icons';
import React from 'react';
import styles from '../ProjectInfo.module.css';

export const technologies = [
  {
    name: 'Next.js & React',
    desc: 'Leveraging the power of Next.js and React for a high-performance web experience.',
  },
  {
    name: 'CSS Modules',
    desc: 'Scoped styling for maintainable and collision-free designs.',
  },
  {
    name: 'In-Browser Build',
    desc: 'Build and preview your web projects instantly without a backend.',
  },
  {
    name: 'AI-First Workflow',
    desc: 'Custom AI processor integrated for seamless code generation and refactoring.',
  },
  {
    name: 'Reactive Proxy State',
    desc: 'Custom, fine-grained state management built on JavaScript Proxies.',
  },
  {
    name: 'Smart Indentation',
    desc: 'Automatic indentation and style enforcement for JS, JSX, CSS, and JSON.',
  },
  {
    name: 'almostnode',
    desc: 'A virtual environment bringing Node.js capabilities directly to your browser.',
  },
  {
    name: 'WebAssembly (WASM)',
    desc: 'Powering high-performance tasks like in-browser building and AI inference.',
  },
  {
    name: 'WebLLM & AI Models',
    desc: 'Running state-of-the-art AI locally for a private and ultra-fast experience.',
  },
];

export default function ProjectTechnologies() {
  return (
    <section className={styles.section}>
      <h2>
        <Icons.Code size={24} /> Technologies
      </h2>
      <div className={styles.techGrid}>
        {technologies.map((tech) => (
          <div key={tech.name} className={styles.techCard}>
            <span className={styles.techName}>{tech.name}</span>
            <span className={styles.techDesc}>{tech.desc}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
