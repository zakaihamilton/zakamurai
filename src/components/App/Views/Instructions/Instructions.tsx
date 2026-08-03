import { Icons } from '@/components/ui/Icons';
import { formatShortcut } from '@/utils/os';
import styles from './Instructions.module.css';

function Shortcut({ value }: { value: string }) {
  return <kbd>{formatShortcut(value)}</kbd>;
}

export default function Instructions() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>Getting started</span>
          <h1 className={styles.title}>Build your next idea here</h1>
          <p className={styles.pitch}>
            Zakamurai keeps the editor, local AI, browser build, and live preview in one focused
            workspace.
          </p>
        </header>

        <div className={styles.quickStart}>
          <span className={styles.quickStartLabel}>The short version</span>
          <ol>
            <li>Open or create a file.</li>
            <li>Ask the local agent for help.</li>
            <li>Review the diff, then build and preview.</li>
          </ol>
        </div>

        <section className={styles.section}>
          <h2>
            <Icons.Folder size={22} /> 1. Shape the workspace
          </h2>
          <div className={styles.content}>
            <p>
              The <strong>File Explorer</strong> is your project map. Open files in the editor,
              create folders with the explorer actions, and use the tabs to move between files,
              logs, preview, and these reference pages.
            </p>
            <ul>
              <li>HTML, CSS, JavaScript, JSX/TSX, and JSON files work out of the box.</li>
              <li>
                Use file search with <Shortcut value="⌃P" /> when the project grows.
              </li>
              <li>
                Edits persist in the browser through IndexedDB, with localStorage as a fallback.
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <h2>
            <Icons.Bot size={22} /> 2. Collaborate with local AI
          </h2>
          <div className={styles.content}>
            <p>
              The AI agent runs through a local WebLLM model selected for your browser and device.
              Your project context stays in the workspace; model downloads are cached locally in
              this browser.
            </p>
            <ul>
              <li>
                Open the agent with <Shortcut value="⌃J" /> or the prompt button in the top bar.
              </li>
              <li>
                Open <strong>AI Models</strong> from the prompt panel to download, remove, or switch
                models. WebGPU and Web Workers are required for local AI.
              </li>
              <li>
                Ask for explanations, project checks, refactors, or a focused change. Specific
                requests and file names produce better results.
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <h2>
            <Icons.Sparkles size={22} /> 3. Review every AI change
          </h2>
          <div className={styles.content}>
            <p>
              AI edits are staged as a change set so you remain in control of the project. The
              editor shows a side-by-side diff before anything is saved to the workspace.
            </p>
            <ul>
              <li>
                Use <strong>Approve &amp; Save</strong> or <Shortcut value="⌘S" /> to keep the
                proposed change.
              </li>
              <li>
                Use <strong>Cancel Changes</strong> or <Shortcut value="⌘. / ⌘⌫" /> to discard it.
              </li>
              <li>
                Check the AI reasoning and project checks when you need more context before
                approving a change.
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <h2>
            <Icons.Play size={22} /> 4. Build, preview, and debug
          </h2>
          <div className={styles.content}>
            <p>
              Builds run in the browser using Zakamurai’s virtual Node.js-like runtime. A successful
              build can open the <strong>Preview</strong> tab automatically.
            </p>
            <ul>
              <li>
                Build with <Shortcut value="⌘↵" /> or the <strong>Build</strong> button.
              </li>
              <li>
                Use <Shortcut value="⌘⇧↵" /> to build without leaving the current page.
              </li>
              <li>
                Open Preview with <Shortcut value="⌃I" /> and inspect build or runtime output in
                Logs with <Shortcut value="⌃U" />.
              </li>
              <li>
                If a build is blocked, use the Readiness page to see entry-point, manifest,
                build-script, or dependency warnings before trying again.
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <h2>
            <Icons.Terminal size={22} /> 5. Keep the loop fast
          </h2>
          <div className={styles.content}>
            <p>These are the shortcuts most useful during an editing session:</p>
            <ul>
              <li>
                Format code with <Shortcut value="⌃⇧F" />.
              </li>
              <li>
                Toggle the sidebar with <Shortcut value="⌃B" /> and change the theme with{' '}
                <Shortcut value="⌃L" />.
              </li>
              <li>
                Open the complete keyboard reference from More Actions → Keyboard Shortcuts or with{' '}
                <Shortcut value="⌃⇧K" />.
              </li>
            </ul>
          </div>
        </section>

        <section className={`${styles.section} ${styles.troubleshooting}`}>
          <h2>
            <Icons.Info size={22} /> When something needs attention
          </h2>
          <div className={styles.content}>
            <ul>
              <li>
                <strong>Local AI unavailable:</strong> use a WebGPU-capable browser, check the
                device readiness card, or continue with editing and browser builds without AI.
              </li>
              <li>
                <strong>Storage is full or unavailable:</strong> export the project as a ZIP before
                closing the tab; the open workspace can remain available in memory temporarily.
              </li>
              <li>
                <strong>Preview fails:</strong> read the Logs tab first, then inspect the project
                compatibility status and the browser console details shown by the preview.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
