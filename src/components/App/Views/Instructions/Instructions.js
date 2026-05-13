import { Icons } from '@/components/Core/Base/Icons';
import React from 'react';
import styles from './Instructions.module.css';

export default function Instructions() {
  return (
    <div className={`${styles.wrapper} scroll-hide`}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Welcome to Zakamurai</h1>
          <p className={styles.pitch}>Master your browser-based IDE with this quick guide.</p>
        </header>

        <section className={styles.section}>
          <h2>
            <Icons.Folder size={24} /> 1. Project Structure
          </h2>
          <div className={styles.content}>
            <p>
              Use the <strong>File Explorer</strong> on the left to manage your project. You can
              create new files and folders, rename them, or delete them. Zakamurai supports HTML,
              CSS, JavaScript, and JSON files out of the box.
            </p>
            <ul>
              <li>Click on a file to open it in the editor.</li>
              <li>
                Use the <strong>action buttons</strong> that appear when hovering over folders in
                the explorer to create new files or folders.
              </li>
              <li>Your changes are automatically saved to your browser's local storage.</li>
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <h2>
            <Icons.Bot size={24} /> 2. AI Collaboration
          </h2>
          <div className={styles.content}>
            <p>
              Zakamurai is built with an <strong>AI-First Workflow</strong>. The AI understands your
              code and can help you generate new features or refactor existing ones.
            </p>
            <ul>
              <li>
                <strong>AI Sidebar:</strong> Toggle with <kbd>⌃J</kbd> or the button in the{' '}
                <strong>Top Bar</strong>. Ask questions or give instructions.
              </li>
              <li>
                <strong>AI Diff:</strong> When the AI suggests changes, you can review them in a
                side-by-side diff view before applying.
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <h2>
            <Icons.Play size={24} /> 3. Build & Preview
          </h2>
          <div className={styles.content}>
            <p>
              See your code come to life instantly. Zakamurai compiles your project directly in the
              browser using a virtual Node.js-like environment.
            </p>
            <ul>
              <li>
                <strong>Compile:</strong> Press <kbd>⌘↵</kbd> (Cmd+Enter) or click the{' '}
                <strong>Compile</strong> button in the top bar.
              </li>
              <li>
                <strong>Preview:</strong> After a successful build, the <strong>Preview</strong> tab
                will open automatically to show your running application.
              </li>
              <li>
                <strong>Logs:</strong> Check the <strong>Logs</strong> tab for build output or
                runtime errors.
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <h2>
            <Icons.Sparkles size={24} /> 4. Tips & Tricks
          </h2>
          <div className={styles.content}>
            <p>Make the most of your experience with these productivity features:</p>
            <ul>
              <li>
                <strong>Smart Formatting:</strong> Press <kbd>⌥⇧F</kbd> (Alt+Shift+F) to instantly
                format your code and keep it clean.
              </li>
              <li>
                <strong>Theme Toggle:</strong> Switch between Light and Dark mode in the top bar to
                suit your environment.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
