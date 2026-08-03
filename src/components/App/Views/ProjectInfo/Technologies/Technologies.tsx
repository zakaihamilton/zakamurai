import { Icons } from '@/components/ui/Icons';
import styles from './Technologies.module.css';

export const technologies = [
  {
    name: 'Next.js 16 & React 19',
    desc: 'The application shell and interactive IDE experience.',
  },
  {
    name: 'CSS Modules',
    desc: 'Scoped, theme-aware styling for maintainable UI components.',
  },
  {
    name: 'Browser compiler',
    desc: 'Build and preview web projects directly in the browser.',
  },
  {
    name: 'Local WebLLM',
    desc: 'Private, browser-local models for explanations, edits, and completions.',
  },
  {
    name: 'almostnode',
    desc: 'A virtual Node.js-like runtime that supports browser builds.',
  },
  {
    name: 'WebAssembly',
    desc: 'High-performance browser primitives for compilation and AI inference.',
  },
  {
    name: 'Proxy-based state',
    desc: 'Fine-grained shared state for the editor, preview, storage, and AI pipeline.',
  },
  {
    name: 'IndexedDB + localStorage',
    desc: 'Browser persistence with a fallback path for workspace recovery.',
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
