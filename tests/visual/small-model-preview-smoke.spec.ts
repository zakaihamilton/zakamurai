import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const NOTES_APP = `import { useState } from 'react';
import styles from './App.module.css';

export default function App() {
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState('');
  const addNote = (event) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setNotes((current) => [...current, value]);
    setDraft('');
  };
  return (
    <main className={styles.app}>
      <section className={styles.shell}>
        <h1 className={styles.title}>Notes</h1>
        <form className={styles.field} onSubmit={addNote}>
          <label className={styles.label} htmlFor="note">New note</label>
          <input id="note" className={styles.control} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <button className={styles.primaryAction} type="submit">Add note</button>
        </form>
        {notes.length ? (
          <ul className={styles.list}>{notes.map((note) => <li className={styles.item} key={note}>{note}</li>)}</ul>
        ) : (
          <p className={styles.muted}>No notes yet.</p>
        )}
      </section>
    </main>
  );
}`;

const NOTES_CSS = `:global(:root), :global(body), :global(#root) {
  margin: 0;
  padding: 0;
  min-height: 100%;
  background: #f5f1ea;
  color: #292521;
}
.app { min-height: 100vh; padding: 1.5rem; background: #f5f1ea; color: #292521; }
.shell { max-width: 40rem; margin: 0 auto; display: grid; gap: 1rem; }
.title { margin: 0; font-size: 1.75rem; }
.field { display: flex; flex-direction: column; gap: 0.5rem; }
.label { font-weight: 600; }
.control { padding: 0.6rem 0.75rem; border: 1px solid #d8cdbf; border-radius: 0.5rem; background: #fff; }
.primaryAction { padding: 0.6rem 1rem; border: 0; border-radius: 0.5rem; background: #a4472f; color: #fff; }
.list { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
.item { padding: 0.75rem 1rem; background: #fffdf8; border: 1px solid #d8cdbf; border-radius: 0.5rem; }
.muted { color: #6f655b; }
@media (width <= 640px) {
  .primaryAction { width: 100%; }
}`;

const SEEDED_FILES = {
  'src/main.jsx':
    'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\n\nReactDOM.createRoot(document.getElementById("root")).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);',
  'src/App.jsx': NOTES_APP,
  'src/App.module.css': NOTES_CSS,
  'package.json':
    '{\n  "name": "small-model-notes",\n  "private": true,\n  "version": "0.1.0",\n  "type": "module",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build",\n    "preview": "vite preview"\n  },\n  "dependencies": {\n    "react": "^19.0.0",\n    "react-dom": "^19.0.0"\n  }\n}',
};

async function seedFileContents(
  page: import('@playwright/test').Page,
  files: Record<string, string>,
) {
  await page.addInitScript((seed) => {
    const DB_NAME = 'zakamurai-project';
    const STORE_NAME = 'kv';
    const KEY = 'zakamurai_file_contents';
    const openRequest = indexedDB.open(DB_NAME, 1);
    openRequest.onupgradeneeded = () => {
      const db = openRequest.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    openRequest.onsuccess = () => {
      const db = openRequest.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(seed, KEY);
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(seed));
      localStorage.setItem('zakamurai_is_sidebar_open', 'true');
    } catch {
      // IndexedDB is the durable source of truth for large file maps.
    }
  }, files);
}

test.describe('small-model IDE preview smoke', () => {
  test('builds seeded notes files and shows them in the Preview iframe', async ({ page }) => {
    test.setTimeout(180_000);
    await seedFileContents(page, SEEDED_FILES);
    await page.goto('/');
    await expect(page.getByText('Initializing workspace...')).not.toBeVisible({ timeout: 60000 });
    await page.waitForSelector('[data-testid]', { state: 'visible', timeout: 30000 });

    await expect(page.getByText('App.jsx', { exact: true }).first()).toBeVisible({
      timeout: 30000,
    });
    await page.getByTestId('compile-btn').filter({ visible: true }).click();
    await expect(page.getByTestId('preview-tab').filter({ visible: true })).toBeVisible({
      timeout: 120000,
    });
    await page.getByTestId('preview-tab').filter({ visible: true }).click();
    await page.waitForTimeout(2500);

    mkdirSync('/opt/cursor/artifacts', { recursive: true });
    await page.screenshot({
      path: '/opt/cursor/artifacts/ide_preview_seeded_notes.png',
      fullPage: true,
    });

    const frame = page.frameLocator('iframe').first();
    await expect(frame.getByRole('heading', { name: 'Notes' })).toBeVisible({ timeout: 30000 });
    await frame.locator('#note').fill('seeded from small-model path');
    await frame.getByRole('button', { name: 'Add note' }).click();
    await expect(frame.getByText('seeded from small-model path')).toBeVisible();
    await page.screenshot({
      path: '/opt/cursor/artifacts/ide_preview_seeded_notes_interactive.png',
      fullPage: true,
    });
  });
});
