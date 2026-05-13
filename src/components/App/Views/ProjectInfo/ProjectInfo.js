import { Icons } from '@/components/Core/Base/Icons';
import React from 'react';
import styles from './ProjectInfo.module.css';

const technologies = [
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
    desc: 'Compile and preview your web projects instantly without a backend.',
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
    desc: 'Powering high-performance tasks like in-browser compilation and AI inference.',
  },
  {
    name: 'WebLLM & AI Models',
    desc: 'Running state-of-the-art AI locally for a private and ultra-fast experience.',
  },
];

export default function ProjectInfo() {
  return (
    <div className={`${styles.wrapper} scroll-hide`}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Zakamurai</h1>
          <p className={styles.pitch}>
            "The ultimate browser-based coding companion that blends a powerful IDE experience with
            seamless AI collaboration. Stop switching between tools and start building instantly."
          </p>
        </header>

        <section className={styles.section}>
          <div className={styles.explanation}>
            <h2>
              <Icons.Sparkles size={24} /> About the Project
            </h2>
            <p>
              Zakamurai is a next-generation, browser-based Integrated Development Environment (IDE)
              designed from the ground up for speed and AI-assisted creativity. It eliminates the
              traditional setup hurdles of local development environments, allowing developers to
              start coding the moment they open their browser.
            </p>
            <p>
              Whether you are prototyping a new idea or building a complex web application,
              Zakamurai provides the tools you need: a high-performance code editor, real-time
              compilation, a live preview area, and an integrated AI that understands your project's
              context to help you write better code faster.
            </p>
          </div>
        </section>

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
      </div>
    </div>
  );
}
