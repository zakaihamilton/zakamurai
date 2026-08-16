import { runManager } from '@/components/AI/Agent';
import { visualPreviewInspectionFailure } from '@/components/AI/Agent/VisualPreviewEvidence';
import { workspaceFulfillsInteractiveRequest } from '@/components/AI/ChangeValidator';
import { describe, expect, it } from 'vitest';
import { createFakeModel, createFakeTools } from './harness';

const SMALL_MODELS = [
  'Qwen3.5-0.8B-q4f16_1-MLC',
  'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
  'Qwen3.5-2B-q4f16_1-MLC',
] as const;

const fence = (source: string) => `\`\`\`jsx\n${source}\n\`\`\``;

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
          <ul className={styles.list}>
            {notes.map((note) => (
              <li className={styles.item} key={note}>{note}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>No notes yet.</p>
        )}
      </section>
    </main>
  );
}`;

const TODO_APP = `import { useState } from 'react';
import styles from './App.module.css';

export default function App() {
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState('');
  const addItem = (event) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setItems((current) => [...current, { id: crypto.randomUUID(), text: value, done: false }]);
    setDraft('');
  };
  const toggle = (id) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  };
  return (
    <main className={styles.app}>
      <h1 className={styles.title}>Todo</h1>
      <form className={styles.row} onSubmit={addItem}>
        <input className={styles.control} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a task" />
        <button className={styles.primaryAction} type="submit">Add</button>
      </form>
      <ul className={styles.list}>
        {items.map((item) => (
          <li className={styles.item} key={item.id}>
            <label className={styles.label}>
              <input type="checkbox" checked={item.done} onChange={() => toggle(item.id)} />
              <span className={item.done ? styles.completed : undefined}>{item.text}</span>
            </label>
          </li>
        ))}
      </ul>
      {!items.length ? <p className={styles.muted}>No tasks yet.</p> : null}
    </main>
  );
}`;

const CONTACT_FORM = `import { useState } from 'react';
import styles from './App.module.css';

export default function App() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle');
  const submit = (event) => {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      setStatus('error');
      return;
    }
    setStatus('success');
  };
  return (
    <main className={styles.app}>
      <h1 className={styles.title}>Contact</h1>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.label} htmlFor="name">Name</label>
        <input id="name" className={styles.control} value={name} onChange={(event) => setName(event.target.value)} />
        <label className={styles.label} htmlFor="email">Email</label>
        <input id="email" className={styles.control} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className={styles.label} htmlFor="message">Message</label>
        <textarea id="message" className={styles.control} value={message} onChange={(event) => setMessage(event.target.value)} />
        <button className={styles.primaryAction} type="submit">Send message</button>
      </form>
      {status === 'success' ? <p className={styles.status}>Message sent.</p> : null}
      {status === 'error' ? <p className={styles.error}>Please fill every field.</p> : null}
    </main>
  );
}`;

const PREVIEW_PASS = {
  status: 'passed',
  title: 'Preview',
  elements: ['main: App', 'h1: App', 'button: Action', 'input: Field'],
  styleAudit: {
    horizontalOverflow: false,
    collapsedControls: [],
    missingExplicitColors: [],
    contrastFailures: [],
    unnamedControls: [],
    missingFocusVisible: false,
    issues: [],
  },
  screenshotCaptured: true,
};

const CASES = [
  {
    id: 'notes',
    request: 'create an interactive notes app',
    source: NOTES_APP,
    preview: {
      ...PREVIEW_PASS,
      title: 'Notes',
      elements: ['main: Notes', 'h1: Notes', 'input: New note', 'button: Add note'],
    },
    required: ['Notes', 'Add note'],
  },
  {
    id: 'todo',
    request: 'create a todo app',
    source: TODO_APP,
    preview: {
      ...PREVIEW_PASS,
      title: 'Todo',
      elements: ['main: Todo', 'h1: Todo', 'input: Add a task', 'button: Add'],
    },
    required: ['Todo', 'Add'],
  },
  {
    id: 'contact',
    request: 'create a contact form',
    source: CONTACT_FORM,
    preview: {
      ...PREVIEW_PASS,
      title: 'Contact',
      elements: ['main: Contact', 'h1: Contact', 'input: Name', 'button: Send message'],
    },
    required: ['Contact', 'Send message'],
  },
  {
    id: 'dashboard',
    request: 'create a dashboard',
    source: `import { useState } from 'react';
import styles from './App.module.css';

export default function App() {
  const [filter, setFilter] = useState('all');
  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>Dashboard</h1>
      <p className={styles.muted}>Overview of the latest activity.</p>
      <div className={styles.row}>
        <button className={styles.primaryAction} type="button" onClick={() => setFilter('all')}>All</button>
        <button className={styles.secondaryAction} type="button" onClick={() => setFilter('orders')}>Orders</button>
      </div>
      <section className={styles.grid}>
        <article className={styles.card}><h2 className={styles.subtitle}>Visitors</h2><p className={styles.status}>1,240</p></article>
        <article className={styles.card}><h2 className={styles.subtitle}>Orders</h2><p className={styles.status}>{filter === 'orders' ? '86' : '86 active'}</p></article>
      </section>
    </main>
  );
}`,
    preview: {
      ...PREVIEW_PASS,
      title: 'Dashboard',
      elements: ['main: Dashboard', 'h1: Dashboard', 'button: All', 'button: Orders'],
    },
    required: ['Dashboard', 'Visitors'],
  },
] as const;

const lightweightResponses = (source: string, extras: string[] = []) => [
  fence(source),
  '{"action":"validate"}',
  '{"action":"finish","summary":"Created app"}',
  '{"action":"finish","summary":"Created and visually verified app"}',
  ...extras,
];

describe('small-model preview prompts', () => {
  it.each(SMALL_MODELS)(
    'keeps %s on fence-only host assistance and requires preview for UI creates',
    async (model) => {
      const scenario = CASES[0];
      const events: Array<{ type?: string; message?: string }> = [];
      const modelClient = createFakeModel([
        fence(scenario.source),
        '{"action":"validate"}',
        '{"action":"finish","summary":"Created notes app"}',
        '{"action":"finish","summary":"Created and visually verified notes app"}',
      ]);
      const tools = createFakeTools({
        validation: [{ status: 'passed', check: 'build' }],
        previews: [scenario.preview],
      });

      const result = await runManager({
        request: scenario.request,
        files: { 'src/App.jsx': 'export default function App() { return null; }' },
        activeFile: 'src/App.jsx',
        model,
        modelClient: modelClient.client,
        validate: tools.validate,
        inspectPreview: tools.inspectPreview,
        onEvent: (event) => events.push(event),
      });

      expect(result.trace.outcome).toBe('success');
      expect(tools.calls.map((call) => call.tool)).toContain('inspect_preview');
      expect(result.files['src/App.jsx']).toContain('Notes');
      expect(result.files['src/App.module.css']).toBeTruthy();
      expect(visualPreviewInspectionFailure(scenario.preview)).toBeNull();
      expect(events.some((event) => event.message?.includes('Host assistance'))).toBe(true);
      const prompt = modelClient.calls[0]?.messages.map((message) => message.content).join('\n');
      expect(prompt).toMatch(/labelled (?:code|source) fence/i);
      expect(prompt).not.toContain('{"action":"write_file"');
    },
  );

  it.each(CASES)('creates a preview-ready $id app on the 1.5B recovery path', async (scenario) => {
    const model = 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC';
    const modelClient = createFakeModel(lightweightResponses(scenario.source));
    const tools = createFakeTools({
      validation: [{ status: 'passed', check: 'build' }],
      previews: [scenario.preview],
    });

    const result = await runManager({
      request: scenario.request,
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      activeFile: 'src/App.jsx',
      model,
      modelClient: modelClient.client,
      validate: tools.validate,
      inspectPreview: tools.inspectPreview,
    });

    expect(result.trace.outcome).toBe('success');
    expect(tools.calls.some((call) => call.tool === 'inspect_preview')).toBe(true);
    for (const token of scenario.required) {
      expect(result.files['src/App.jsx']).toContain(token);
    }
    expect(result.files['src/App.module.css']).toMatch(/\.|\{/);
    expect(workspaceFulfillsInteractiveRequest(result.files, scenario.request)).toBeNull();
    expect(visualPreviewInspectionFailure(scenario.preview)).toBeNull();
    expect(result.summary.toLowerCase()).toMatch(
      /visual|preview|created|verified|app|notes|todo|contact|dashboard/,
    );
  });

  it('finishes a responsive dashboard on the lightweight path without an extra validate turn', async () => {
    const model = 'Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC';
    const source = `import styles from './App.module.css';

export default function App() {
  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>Dashboard</h1>
      <p className={styles.muted}>Overview of the latest activity across the workspace.</p>
      <section className={styles.grid}>
        <article className={styles.card}>
          <h2 className={styles.subtitle}>Visitors</h2>
          <p className={styles.status}>1,240</p>
        </article>
        <article className={styles.card}>
          <h2 className={styles.subtitle}>Orders</h2>
          <p className={styles.status}>86</p>
        </article>
        <article className={styles.card}>
          <h2 className={styles.subtitle}>Revenue</h2>
          <p className={styles.status}>$12.4k</p>
        </article>
      </section>
    </main>
  );
}`;
    const modelClient = createFakeModel([
      fence(source),
      '{"action":"finish","summary":"Created responsive dashboard"}',
    ]);
    const tools = createFakeTools({
      validation: [{ status: 'passed', check: 'build' }],
      previews: [
        {
          status: 'passed',
          title: 'Dashboard',
          elements: ['main: Dashboard', 'h1: Dashboard', 'h2: Visitors', 'h2: Orders'],
          screenshotCaptured: true,
          styleAudit: {
            horizontalOverflow: false,
            collapsedControls: [],
            missingExplicitColors: [],
            contrastFailures: [],
            unnamedControls: [],
            missingFocusVisible: false,
            issues: [],
          },
        },
      ],
    });

    const result = await runManager({
      request: 'Create a responsive dashboard',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      activeFile: 'src/App.jsx',
      model,
      modelClient: modelClient.client,
      validate: tools.validate,
      inspectPreview: tools.inspectPreview,
    });

    expect(result.trace.outcome).toBe('success');
    // Fence write + one finish: host owns CSS, inspect_preview, and validate.
    expect(modelClient.calls.length).toBeLessThanOrEqual(2);
    expect(result.files['src/App.jsx']).toContain('Dashboard');
    expect(result.files['src/App.module.css']).toMatch(/@media/);
    expect(tools.calls.map((call) => call.tool)).toContain('inspect_preview');
    expect(tools.calls.map((call) => call.tool)).toContain('validate');
  });

  it('narrows demanding architecture prompts on recovery models but still finishes a single-file preview', async () => {
    const model = 'Qwen3.5-0.8B-q4f16_1-MLC';
    const events: Array<{ message?: string }> = [];
    const modelClient = createFakeModel(lightweightResponses(NOTES_APP));
    const tools = createFakeTools({
      validation: [{ status: 'passed', check: 'build' }],
      previews: [CASES[0].preview],
    });

    const result = await runManager({
      request: 'create a notes app by rewriting the entire codebase architecture across all files',
      scope: 'project',
      files: {
        'src/App.jsx': 'export default function App() { return null; }',
        'src/Extra.jsx': 'export default function Extra() { return null; }',
      },
      activeFile: 'src/App.jsx',
      model,
      modelClient: modelClient.client,
      validate: tools.validate,
      inspectPreview: tools.inspectPreview,
      onEvent: (event) => events.push(event),
    });

    expect(result.trace.outcome).toBe('success');
    expect(
      events.some((event) =>
        /recovery-tier|larger cached model|one target file/i.test(event.message || ''),
      ),
    ).toBe(true);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.files['src/Extra.jsx']).toBe('export default function Extra() { return null; }');
    expect(result.files['src/App.jsx']).toContain('Notes');
    expect(tools.calls.map((call) => call.tool)).toContain('inspect_preview');
  });

  it('rejects incomplete preview evidence before treating a small-model UI create as finished', async () => {
    const model = 'Qwen3.5-2B-q4f16_1-MLC';
    const modelClient = createFakeModel([
      fence(NOTES_APP),
      '{"action":"validate"}',
      '{"action":"finish","summary":"Created notes app"}',
      '{"action":"inspect_preview"}',
      '{"action":"finish","summary":"Created and visually verified notes app"}',
    ]);
    const tools = createFakeTools({
      validation: [{ status: 'passed', check: 'build' }],
      previews: [
        { status: 'passed', title: 'Notes', elements: [], screenshotCaptured: false },
        CASES[0].preview,
      ],
    });

    const result = await runManager({
      request: 'create an interactive notes app',
      files: { 'src/App.jsx': 'export default function App() { return null; }' },
      activeFile: 'src/App.jsx',
      model,
      modelClient: modelClient.client,
      validate: tools.validate,
      inspectPreview: tools.inspectPreview,
    });

    expect(result.trace.outcome).toBe('success');
    expect(
      tools.calls.filter((call) => call.tool === 'inspect_preview').length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      visualPreviewInspectionFailure({ status: 'passed', elements: [], screenshotCaptured: false }),
    ).toContain('no DOM landmarks');
  });
});
