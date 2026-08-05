import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  validateAIChanges,
  validateComponentStyling,
  validateContentSyntax,
  validateContentSyntaxAsync,
  validateCssContentSafety,
  validateCssModuleUsage,
  validateFileContentType,
  validateForbiddenStateLibraryUsage,
  validateGeneratedPlaceholder,
  validateProjectPath,
  validateRequestFulfillment,
  workspaceFulfillsInteractiveRequest,
} from './ChangeValidator';

describe('AI change validation', () => {
  it('accepts a project-relative multi-file change set', () => {
    const result = validateAIChanges([
      { path: 'src/App.jsx', after: 'export default null' },
      { path: 'src/styles.css', after: 'body {}' },
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(2);
  });

  it.each(['/etc/passwd', '../secret.js', 'src/../secret.js', 'C:\\secret.js'])(
    'rejects unsafe path %s',
    (path) => expect(validateProjectPath(path)).toBeTruthy(),
  );

  it('rejects duplicate targets and malformed content', () => {
    const result = validateAIChanges([
      { path: 'src/a.js', after: 'one' },
      { path: 'src/a.js', after: 'two' },
      { path: 'src/b.js', after: 4 as unknown as string },
    ]);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
  });

  it('rejects non-array payloads and missing paths', () => {
    expect(validateAIChanges(null as never).rejected).toEqual(['Changes must be an array.']);
    expect(validateAIChanges([{ path: '', after: 'code' }]).rejected[0]).toBe(
      'A file path is required.',
    );
  });

  it('rejects empty and non-string paths', () => {
    expect(validateProjectPath('')).toBe('A file path is required.');
    expect(validateProjectPath('   ')).toBe('A file path is required.');
    expect(validateProjectPath(null as never)).toBe('A file path is required.');
    expect(validateProjectPath(42 as never)).toBe('A file path is required.');
  });

  it('accepts changes using the filePath alias', () => {
    const result = validateAIChanges([
      { path: 'src/alias.js', filePath: 'src/alias.js', after: 'export default 1' },
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(1);
  });

  it('reports CSS brace and parenthesis errors', () => {
    expect(validateContentSyntax('src/style.css', '.class { color: red;')).toContain('Unclosed');
    expect(validateContentSyntax('src/style.css', '.class { background: url(; }')).toContain(
      'Unmatched',
    );
  });

  it('rejects cyclic custom properties and runaway CSS function nesting', () => {
    expect(
      validateCssContentSafety('src/Todo.module.css', '--mobile-padding: var(--mobile-padding);'),
    ).toContain('cannot reference itself');
    expect(
      validateCssContentSafety(
        'src/Todo.module.css',
        `.todo { width: ${'calc('.repeat(17)}100%${')'.repeat(17)}; }`,
      ),
    ).toContain('nesting exceeds');
    expect(
      validateCssContentSafety('src/Todo.module.css', '.todo { width: calc(100% - 2rem); }'),
    ).toBeNull();
  });

  it('ignores brackets inside template literals and comments', () => {
    const withTemplate = 'const x = `value { not a brace`; function ok() { return 1; }';
    expect(validateContentSyntax('src/app.js', withTemplate)).toBeNull();
    const withBacktickComment = 'const s = `// fake comment {`; const ok = () => {};';
    expect(validateContentSyntax('src/app.ts', withBacktickComment)).toBeNull();
  });

  it('does not mistake apostrophes in JSX text for unterminated strings', () => {
    expect(
      validateContentSyntax('src/App.jsx', "export default () => <h1>Let's play</h1>;"),
    ).toBeNull();
  });

  it('returns null for non-string content or missing path in sync validation', () => {
    expect(validateContentSyntax('src/app.js', null as never)).toBeNull();
    expect(validateContentSyntax('', 'const x = 1;')).toBeNull();
  });

  it('rejects malformed syntax in proposals', () => {
    const result = validateAIChanges([
      { path: 'src/bad.json', after: '{ invalid json }' },
      { path: 'src/bad.js', after: 'function test() {' },
    ]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0]).toContain('Invalid JSON syntax');
    expect(result.rejected[1]).toContain('Unclosed');
  });

  it('rejects CSS embedded in JSX while allowing CSS Modules', () => {
    const inline = "export default () => <main style={{ color: 'red' }} />;";
    expect(validateComponentStyling('src/App.jsx', inline)).toContain('Inline CSS is not allowed');
    expect(validateAIChanges([{ path: 'src/App.jsx', after: inline }]).rejected[0]).toContain(
      'Inline CSS is not allowed',
    );
    expect(
      validateComponentStyling(
        'src/App.jsx',
        "import styles from './App.module.css'; export default () => <main className={styles.app} />;",
      ),
    ).toBeNull();
  });

  it('rejects CSS Module side-effect imports and literal module class names', () => {
    const sideEffectImport =
      'import \'./App.module.css\'; export default () => <main className="app" />;';
    expect(validateCssModuleUsage('src/App.jsx', sideEffectImport)).toContain('default-imported');
    expect(
      validateAIChanges([{ path: 'src/App.jsx', after: sideEffectImport }]).rejected[0],
    ).toContain('default-imported');

    const literalClass =
      'import styles from \'./App.module.css\'; export default () => <main className="app" />;';
    expect(validateCssModuleUsage('src/App.jsx', literalClass)).toContain(
      'className={styles.container}',
    );
    expect(
      validateCssModuleUsage(
        'src/App.jsx',
        "import styles from './App.module.css'; export default () => <main className={styles.app} />;",
      ),
    ).toBeNull();
  });

  it('rejects unrequested state-management libraries', () => {
    expect(
      validateForbiddenStateLibraryUsage(
        'src/App.jsx',
        "import { createStore } from 'redux'; export default function App() { return null; }",
      ),
    ).toContain('Do not introduce Redux');
    expect(
      validateAIChanges([
        {
          path: 'package.json',
          after: '{"dependencies":{"@reduxjs/toolkit":"^2.0.0"}}',
        },
      ]).rejected[0],
    ).toContain('Do not introduce Redux');
    expect(
      validateForbiddenStateLibraryUsage(
        'src/App.jsx',
        'export default function App() { return null; }',
      ),
    ).toBeNull();
  });

  it('rejects comment-only implementation placeholders', () => {
    const placeholder = '// Your implementation of the App.jsx file goes here.';
    expect(validateGeneratedPlaceholder('src/App.jsx', placeholder)).toContain(
      'only a placeholder',
    );
    expect(
      validateAIChanges([{ path: 'src/App.jsx', content: placeholder }]).rejected[0],
    ).toContain('only a placeholder');
    expect(validateGeneratedPlaceholder('src/App.jsx', '// Existing documentation.')).toBeNull();
    expect(
      validateGeneratedPlaceholder(
        'src/App.jsx',
        'export default function App() { return <main />; }',
      ),
    ).toBeNull();
  });

  it('rejects prose paraphrases written to JSX paths', () => {
    expect(validateGeneratedPlaceholder('src/App.jsx', 'Create the tic tac toe game')).toContain(
      'not valid source code',
    );
    expect(
      validateAIChanges([{ path: 'src/App.jsx', content: 'Create a tic tac toe game' }])
        .rejected[0],
    ).toContain('not valid source code');
    expect(
      validateGeneratedPlaceholder(
        'src/App.jsx',
        'import { useState } from "react";\nexport default function App() { return <main />; }',
      ),
    ).toBeNull();
  });

  it('rejects trivial create shells that are not interactive', () => {
    expect(
      validateRequestFulfillment(
        'src/App.jsx',
        'export default function App() { return <main><h1>Notes</h1></main>; }',
        'create a notes app',
      ),
    ).toContain('only renders a heading');
    expect(
      validateRequestFulfillment(
        'src/App.jsx',
        'export default function App() {\n  return (\n    <div>\n      <h1>New Project</h1>\n      <p>Start coding here...</p>\n    </div>\n  );\n}\n',
        'create a notes app',
      ),
    ).toContain('starter template');
    expect(
      workspaceFulfillsInteractiveRequest(
        {
          'src/main.jsx':
            'import React from "react";\nimport App from "./App";\nReactDOM.createRoot(document.getElementById("root")).render(<App />);\n',
          'src/App.jsx': 'export default function App() { return <h1>Notes</h1>; }',
        },
        'create a notes app',
      ),
    ).toContain('only renders a heading');
    const playable = `import { useState } from "react";
import styles from "./App.module.css";
export default function App() {
  const [items, setItems] = useState(["One", "Two", "Three"]);
  const [draft, setDraft] = useState("");
  const addItem = () => {
    if (!draft.trim()) return;
    setItems([...items, draft.trim()]);
    setDraft("");
  };
  return (
    <main className={styles.app}>
      <h1 className={styles.title}>Notes</h1>
      <input className={styles.button} value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button type="button" className={styles.button} onClick={addItem}>
        Add
      </button>
      <div className={styles.list}>
        {items.map((item) => (
          <button key={item} type="button" className={styles.button} onClick={() => setItems(items.filter((value) => value !== item))}>
            {item}
          </button>
        ))}
      </div>
    </main>
  );
}
`;
    expect(validateRequestFulfillment('src/App.jsx', playable, 'create a notes app')).toBeNull();
    expect(
      workspaceFulfillsInteractiveRequest(
        { 'src/App.jsx': playable, 'src/App.module.css': '.app { display: grid; }\n' },
        'create a notes app',
      ),
    ).toBeNull();
    expect(
      workspaceFulfillsInteractiveRequest({ 'src/App.jsx': playable }, 'create a notes app'),
    ).toContain('missing a co-located CSS Module');
  });

  it('rejects a stylesheet assigned to a JSX path', () => {
    const css = '.task { display: flex; }\n@media (width < 600px) { .task { display: block; } }';
    expect(validateFileContentType('src/components/Task.jsx', css)).toContain(
      'CSS content cannot be written',
    );
    expect(
      validateAIChanges([{ path: 'src/components/Task.jsx', after: css }]).rejected[0],
    ).toContain('CSS content cannot be written');
    expect(validateFileContentType('src/components/Task.module.css', css)).toBeNull();
  });

  it('rejects CSS rules appended after otherwise valid JSX source', () => {
    const sourceWithCss = `
      import React from 'react';
      export default function App() {
        return <main />;
      }

      .app { color: red; }
    `;
    expect(validateFileContentType('src/App.jsx', sourceWithCss)).toContain(
      'CSS content cannot be written',
    );
  });

  it('rejects CSS custom-property declarations embedded in JSX source', () => {
    const sourceWithCss = `
      import React from 'react';
      export default function App() {
        return <main />;
      }
      const styles = {
        --surface: '#fff';
      };
    `;
    expect(validateFileContentType('src/App.jsx', sourceWithCss)).toContain(
      'CSS content cannot be written',
    );
  });

  it('rejects a duplicate local styles declaration beside a CSS Module import', () => {
    const duplicateStyles = `
      import styles from './App.module.css';
      const styles = {};
      export default function App() { return <main className={styles.app} />; }
    `;
    expect(validateCssModuleUsage('src/App.jsx', duplicateStyles)).toContain(
      'styles is declared more than once',
    );
  });

  it('rejects an interactive stylesheet that collapses referenced controls', () => {
    const source = `${`
      import { useState } from 'react';
      import styles from './App.module.css';
      export default function App() {
        const [items, setItems] = useState(['one']);
        return <main>{items.map((item) => <button key={item} onClick={() => setItems(items)} className={styles.cell}>{item}</button>)}</main>;
      }
    `}
      /** ${'x'.repeat(300)} */`;
    const result = workspaceFulfillsInteractiveRequest(
      { 'src/App.jsx': source, 'src/App.module.css': '.cell { height: 2px; }' },
      'create an interactive list',
    );
    expect(result).toContain('collapses or hides');
  });

  it('accepts code with comments containing unmatched brackets', () => {
    const codeWithComments = `
      // Single line comment with unclosed { bracket
      /* Multi-line comment with unclosed ( bracket */
      function valid() { return true; }
    `;
    expect(validateContentSyntax('src/app.js', codeWithComments)).toBeNull();
  });

  it('uses esbuildTransform when provided in validateContentSyntaxAsync', async () => {
    const mockEsbuild = vi.fn().mockImplementation((code) => {
      if (code.includes('syntaxError')) throw new Error('Unexpected token');
    });

    const validResult = await validateContentSyntaxAsync(
      'src/app.jsx',
      'const x = 1;',
      mockEsbuild,
    );
    expect(validResult).toBeNull();
    expect(mockEsbuild).toHaveBeenCalledWith('const x = 1;', { loader: 'jsx' });

    const invalidResult = await validateContentSyntaxAsync(
      'src/app.jsx',
      'const syntaxError = ;',
      mockEsbuild,
    );
    expect(invalidResult).toContain('Syntax error in src/app.jsx');

    await validateContentSyntaxAsync('src/app.ts', 'const n: number = 1;', mockEsbuild);
    expect(mockEsbuild).toHaveBeenCalledWith('const n: number = 1;', { loader: 'ts' });

    await validateContentSyntaxAsync(
      'src/app.tsx',
      'export const El = () => <div />;',
      mockEsbuild,
    );
    expect(mockEsbuild).toHaveBeenCalledWith('export const El = () => <div />;', { loader: 'tsx' });

    await validateContentSyntaxAsync('src/app.js', 'const x = 1;', mockEsbuild);
    expect(mockEsbuild).toHaveBeenCalledWith('const x = 1;', { loader: 'js' });
  });

  it('supports validateAIChangesAsync with structured details', async () => {
    const { validateAIChangesAsync } = await import('./ChangeValidator');
    const mockEsbuild = vi.fn().mockImplementation((code) => {
      if (code.includes('bad')) throw new Error('Transform failed');
    });

    const res = await validateAIChangesAsync(
      [
        { path: 'src/good.js', content: 'const a = 1;' },
        { path: 'src/bad.js', content: 'const bad = ;' },
      ],
      mockEsbuild,
    );

    expect(res.accepted).toHaveLength(1);
    expect(res.rejected).toHaveLength(1);
    expect(res.details?.[0]?.type).toBe('syntax');
    expect(res.details?.[0]?.path).toBe('src/bad.js');
  });

  it('validateAIChangesAsync reports path, conflict, and content errors', async () => {
    const { validateAIChangesAsync } = await import('./ChangeValidator');

    const res = await validateAIChangesAsync([
      { path: '/absolute.js', filePath: '/absolute.js', content: 'x' },
      { path: 'src/a.js', content: 'first' },
      { path: 'src/a.js', content: 'second' },
      { path: 'src/b.js', after: 42 as unknown as string },
    ]);

    expect(res.accepted).toHaveLength(1);
    expect(res.rejected).toHaveLength(3);
    expect(res.details?.map((d) => d.type)).toEqual(['path', 'conflict', 'content']);
    expect(res.details?.[0]?.path).toBe('/absolute.js');
  });

  it('validateAIChangesAsync rejects non-array input', async () => {
    const { validateAIChangesAsync } = await import('./ChangeValidator');
    const res = await validateAIChangesAsync('not-array' as never);
    expect(res.accepted).toEqual([]);
    expect(res.rejected).toEqual(['Changes must be an array.']);
    expect(res.details).toEqual([]);
  });

  it('rejects all generated absolute and traversal paths (property)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 1 }).map((segment) => `/${segment}`),
          fc.string({ minLength: 1 }).map((segment) => `../${segment}`),
          fc.string({ minLength: 1 }).map((segment) => `src/../${segment}`),
          fc.string({ minLength: 1 }).map((segment) => `C:\\${segment}`),
        ),
        (unsafePath) => {
          expect(validateProjectPath(unsafePath)).toBeTruthy();
        },
      ),
    );
  });

  it('accepts simple project-relative paths (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z][a-z0-9_-]*$/), { minLength: 1, maxLength: 4 }),
        (segments) => {
          const path = segments.join('/');
          expect(validateProjectPath(path)).toBeNull();
        },
      ),
    );
  });
});
