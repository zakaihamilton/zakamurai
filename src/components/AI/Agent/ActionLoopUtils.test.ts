import { describe, expect, it } from 'vitest';
import {
  appendMissingCssModuleRules,
  ensureCoLocatedCssModule,
  missingCssModuleRules,
  normalizeGeneratedInteractiveSource,
  normalizeSideEffectCssSource,
  recoverWorkspaceCssModules,
  repairCssModuleStylesheet,
  rewriteInlineStylesToCssModule,
} from './ActionLoopUtils';
import { resolveProjectStyleProfile } from './ProjectStyleProfile';

describe('generic CSS Module recovery', () => {
  it('completes a stylesheet rewrite with every class used by its importer', () => {
    const files = {
      'src/TodoApp.jsx':
        "import styles from './TodoApp.module.css'; export default () => <main className={styles.todoApp}><input className={styles.todoInput} /></main>;",
    };
    const repaired = appendMissingCssModuleRules(
      '.todoApp { display: grid; }',
      files['src/TodoApp.jsx'],
    );

    expect(repaired).toContain('.todoInput');
    expect(
      missingCssModuleRules('src/TodoApp.module.css', repaired || '', {
        ...files,
        'src/TodoApp.module.css': repaired || '',
      }),
    ).toEqual([]);
  });

  it('recovers component classes without injecting global element resets', () => {
    const source = `import styles from './TodoApp.module.css';
export default () => <main className={styles.app}><form><input placeholder="Add a task" /><button>Add</button></form></main>;`;
    const repaired = appendMissingCssModuleRules(
      '.app { min-height: 100vh; background: #0f172a; }',
      source,
    );

    expect(repaired).toContain('.app');
    expect(repaired).not.toContain(':global(button)');
    expect(repaired).not.toContain(':global(input)');
  });

  it('migrates the manager fallback palette without changing unrelated themes', () => {
    const source =
      "import styles from './App.module.css'; export default () => <main className={styles.app}><form><input className={styles.control} /><button className={styles.button}>Add</button></form></main>;";
    const legacy = `:global(body) { background: #f8fafc; }
.app { min-height: 100vh; padding: 2rem; color: #e2e8f0; background: #0f172a; }
.control { width: 100%; padding: 0.65rem 0.75rem; color: #e2e8f0; background: #172554; }
.button { background: #1e3a8a; color: #f8fafc; }`;

    const repaired = appendMissingCssModuleRules(legacy, source);

    expect(repaired).toContain('background: #ffffff');
    expect(repaired).toContain('background: #4f46e5');
    expect(repaired).not.toContain('background: #172554');
    expect(repaired).not.toContain('background: #1e3a8a');
  });

  it('does not rewrite an intentionally authored theme with one fallback-like color', () => {
    const source =
      "import styles from './App.module.css'; export default () => <main className={styles.app}><button className={styles.button}>Save</button></main>;";
    const authored = '.app { background: #0f172a; }\n.button { background: #d97706; }';

    const repaired = appendMissingCssModuleRules(authored, source);

    expect(repaired).toBeNull();
  });

  it('recovers missing module files and missing rules without changing source', () => {
    const files = {
      'src/App.jsx':
        "import styles from './App.module.css'; export default () => <main className={styles.app}><button className={styles.button}>Add</button></main>;",
    };
    const recovered = recoverWorkspaceCssModules(files);

    expect(recovered).toHaveLength(1);
    expect(recovered[0].path).toBe('src/App.module.css');
    expect(recovered[0].content).toContain('.app');
    expect(recovered[0].content).toContain('.button');
  });

  it('falls back to safe module classes for dynamic inline style objects', () => {
    const rewritten = rewriteInlineStylesToCssModule(
      'src/App.jsx',
      'export default function App({ theme }) { return <main style={{ ...theme.card, color: theme.color }} />; }',
    );

    expect(rewritten).not.toBeNull();
    expect(rewritten?.content).not.toContain('style=');
    expect(rewritten?.content).toContain('styles.inline0');
    expect(rewritten?.stylesheet).toContain('.inline0');
  });

  it('scopes literal classes inside template className expressions', () => {
    const normalized = normalizeSideEffectCssSource(
      'src/App.jsx',
      'import "./App.css"; export default () => <main className={`cell ${value ? `player-${value}` : ""}`} />;',
    );

    expect(normalized?.content).toContain('className={styles.cell}');
    expect(normalized?.content).not.toContain('className={`');
  });

  it('converts mapped div click targets into typed buttons without changing their content', () => {
    const normalized = normalizeSideEffectCssSource(
      'src/App.jsx',
      `import './App.css';
export default function App({ items }) {
  return <section>{items.map((item) => (
    <div className={\`item \${item.id}\`} onClick={() => select(item)}>
      <strong>{item.label}</strong>
    </div>
  ))}</section>;
}`,
    );

    expect(normalized?.content).toContain('<button type="button"');
    expect(normalized?.content).toContain('<strong>{item.label}</strong>');
    expect(normalized?.content).toContain('onClick={() => select(item)}');
    expect(normalized?.content).not.toContain('<div className=');
    expect(normalized?.content).not.toContain('</div>');
  });

  it('leaves non-collection layout click handlers unchanged', () => {
    const normalized = normalizeSideEffectCssSource(
      'src/App.jsx',
      `import './App.css';
export default function App() {
  return <div onClick={() => openPanel()}><span>Open panel</span></div>;
}`,
    );

    expect(normalized?.content).toContain('<div onClick={() => openPanel()}>');
    expect(normalized?.content).not.toContain('<button type="button"');
  });

  it('moves top-level callbacks that use React setters into the owning component', () => {
    const normalized = normalizeSideEffectCssSource(
      'src/App.jsx',
      `import React, { useState } from 'react';
import './App.css';
function App() {
  const [value, setValue] = useState('ready');
  return <button onClick={resetValue}>{value}</button>;
}
function resetValue() {
  setValue('reset');
}
export default App;`,
    );

    const content = normalized?.content || '';
    expect(content.match(/function resetValue/g)).toHaveLength(1);
    expect(content.indexOf('function resetValue')).toBeGreaterThan(content.indexOf('function App'));
    expect(content).toContain("setValue('reset')");
  });

  it('fluidizes oversized fixed dimensions on generated interactive controls', () => {
    const source =
      'import styles from "./App.module.css"; export default function App() { return <button className={styles.cell}>A</button>; }';
    const repaired = repairCssModuleStylesheet(
      'src/App.module.css',
      '.cell { width: 100px; height: 100px; padding: 1rem; }',
      { 'src/App.jsx': source },
      undefined,
      { responsive: true },
    );

    expect(repaired).toContain('width: min(100%, 12rem);');
    expect(repaired).toContain('height: auto; min-height: 2.75rem;');
    expect(repaired).not.toContain('width: 100px');
    expect(repaired).not.toContain('height: 100px');
  });

  it('repairs hard-coded turn guards and stale derived-state reads generically', () => {
    const source = `import { useState } from 'react';
export default function App() {
  const [items, setItems] = useState([]);
  const [currentTurn, setCurrentTurn] = useState('first');
  const calculateStatus = () => items[0] || 'empty';
  const handleMove = (item) => {
    if (currentTurn !== 'first') return;
    const nextItems = [...items, item];
    setItems(nextItems);
    setCurrentTurn(currentTurn === 'first' ? 'second' : 'first');
    calculateStatus();
  };
  return <button onClick={() => handleMove('new')}>{calculateStatus()}</button>;
}`;

    const normalized = normalizeGeneratedInteractiveSource(source);

    expect(normalized).not.toContain("currentTurn !== 'first'");
    expect(normalized).toContain('const calculateStatus = (nextItems = items)');
    expect(normalized).toContain('setItems(nextItems);\n    setCurrentTurn');
    expect(normalized).toContain('calculateStatus(nextItems);');
    expect(normalized).toContain('calculateStatus()}');
  });

  it('repairs the player naming shape used by generated turn-based interfaces', () => {
    const normalized = normalizeGeneratedInteractiveSource(`import { useState } from 'react';
export default function App() {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [ currentPlayer, setCurrentPlayer] = useState('X');
  const checkForWin = () => board[0];
  const handleCellClick = (index) => {
    if (gameOver || board[index] || currentPlayer !== 'X') return;
    const newBoard = [...board];
    newBoard[index] = currentPlayer;
    setBoard(newBoard);
    setCurrentPlayer(currentPlayer === 'X' ? 'O' : 'X');
    checkForWin();
  };
  return <button onClick={() => handleCellClick(0)}>{checkForWin()}</button>;
}`);

    expect(normalized).not.toContain("currentPlayer !== 'X'");
    expect(normalized).toContain('const checkForWin = (newBoard = board)');
    expect(normalized).toContain('checkForWin(newBoard);');
  });
});

describe('ensureCoLocatedCssModule', () => {
  it('generates CSS for static dashboards that already bind a CSS Module', () => {
    const source = `import styles from './App.module.css';

export default function App() {
  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>Dashboard</h1>
      <section className={styles.grid}>
        <article className={styles.card}>
          <h2 className={styles.subtitle}>Visitors</h2>
          <p className={styles.status}>1,240</p>
        </article>
      </section>
    </main>
  );
}`;
    const profile = resolveProjectStyleProfile({
      'src/App.jsx': source,
      'package.json': '{"name":"app"}',
    });
    const ensured = ensureCoLocatedCssModule('src/App.jsx', source, profile);
    expect(ensured?.stylesheetPath).toBe('src/App.module.css');
    expect(ensured?.stylesheet).toMatch(/@media/);
    expect(ensured?.stylesheet).toContain('.grid');
  });
});
