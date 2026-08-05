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
