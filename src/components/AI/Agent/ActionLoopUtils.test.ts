import { describe, expect, it } from 'vitest';
import {
  appendMissingCssModuleRules,
  missingCssModuleRules,
  recoverWorkspaceCssModules,
  rewriteInlineStylesToCssModule,
} from './ActionLoopUtils';

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
});
