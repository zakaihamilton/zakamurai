import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  validateAIChanges,
  validateComponentStyling,
  validateContentSyntax,
  validateContentSyntaxAsync,
  validateCssContentSafety,
  validateCssModuleRelationships,
  validateCssModuleUsage,
  validateDeclaredFunctionCalls,
  validateDeclaredStateVariables,
  validateFileContentType,
  validateForbiddenStateLibraryUsage,
  validateGeneratedPlaceholder,
  validateGeneratedSourceShape,
  validateProjectPath,
  validateRequestFulfillment,
  workspaceFulfillsInteractiveRequest,
} from './ChangeValidator';

describe('AI change validation', () => {
  it('validates CSS Module imports and referenced selectors across the workspace', () => {
    const source =
      'import styles from "./App.module.css"; export default () => <main className={styles.app}><button className={styles.primaryAction}>Save</button></main>;';
    expect(
      validateCssModuleRelationships({
        'src/App.jsx': source,
        'src/App.module.css': '.app {}\n.primaryAction {}',
      }),
    ).toEqual([]);
    expect(
      validateCssModuleRelationships({
        'src/App.jsx': source,
        'src/App.module.css': '.app {}',
      })[0],
    ).toContain('primaryAction');
    expect(validateCssModuleRelationships({ 'src/App.jsx': source })[0]).toContain(
      'does not resolve',
    );
  });

  it('can require a generated component to import its co-located module', () => {
    expect(
      validateCssModuleRelationships(
        { 'src/App.jsx': 'export default () => <main>App</main>;' },
        { requireCoLocatedFor: ['src/App.jsx'] },
      ),
    ).toEqual([
      'Generated component src/App.jsx is missing its co-located src/App.module.css import.',
    ]);
  });

  it('accepts a project-relative multi-file change set', () => {
    const result = validateAIChanges([
      { path: 'src/App.jsx', after: 'export default null' },
      { path: 'src/styles.css', after: 'body {}' },
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(2);
  });

  it.each([
    '/etc/passwd',
    '../secret.js',
    'src/../secret.js',
    'src/./App.jsx',
    './App.jsx',
    'C:\\secret.js',
  ])('rejects unsafe path %s', (path) => expect(validateProjectPath(path)).toBeTruthy());

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

  it('rejects the untouched starter screen through every AI change path', () => {
    const starter = `export default function App() {
  return (
    <div>
      <h1>New Project</h1>
      <p>No items yet. Start adding some!</p>
    </div>
  );
}`;

    expect(validateGeneratedPlaceholder('src/App.jsx', starter)).toContain('starter template');
    expect(validateAIChanges([{ path: 'src/App.jsx', content: starter }]).rejected[0]).toContain(
      'starter template',
    );
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
    expect(
      validateCssModuleUsage(
        'src/App.jsx',
        'import styles from "./App.module.css"; export default function App() { return <button className={`cell ${styles.cell}`}>X</button>; }',
      ),
    ).toContain('instead of global or template class names');
    expect(
      validateRequestFulfillment(
        'src/App.jsx',
        'import { useState } from "react"; export default function App() { const [board, setBoard] = useState(Array(9).fill(null)); const handleClick = (index) => setBoard((prevBoard) => [...prevBoard, "X"]); return <button onClick={() => handleClick(0)}>X</button>; }',
        'create a tic tac toe game',
      ),
    ).toContain('appends an indexed interaction');
    expect(
      validateRequestFulfillment(
        'src/App.jsx',
        'import { useState } from "react"; export default function App() { const [board, setBoard] = useState(Array(9).fill(null)); const checkWin = () => board[0]; return <div>{board.map((cell, index) => <div onClick={() => setBoard(board)}>{cell}</div>)}</div>; }',
        'create a tic tac toe game',
      ),
    ).toContain('uses a non-interactive element');
    expect(
      validateRequestFulfillment(
        'src/App.jsx',
        'import { useState } from "react"; export default function App() { const [board, setBoard] = useState(Array(9).fill(null)); return <main><div>{board.map((cell, index) => <div onClick={() => setBoard(board)}>{cell}</div>)}</div><button onClick={() => setBoard(Array(9).fill(null))}>Reset</button></main>; }',
        'create a tic tac toe game',
      ),
    ).toContain('uses a non-interactive element');
    expect(
      validateRequestFulfillment(
        'src/App.jsx',
        'import { useState } from "react"; export default function App() { const [board, setBoard] = useState(Array(9).fill(null)); const checkWin = () => board[0]; const resetGame = () => setBoard(Array(9).fill(null)); const handleClick = () => { setBoard(board); checkWin(); }; return <main>{board.map((cell, index) => <button onClick={handleClick}>{cell}</button>)}<button onClick={resetGame}>Reset</button></main>; }',
        'create a tic tac toe game',
      ),
    ).toContain('derives status from stale state');
    expect(
      validateRequestFulfillment(
        'src/App.jsx',
        'import { useState } from "react"; export default function App() { const [currentPlayer, setCurrentPlayer] = useState("X"); const [value, setValue] = useState(null); const handleMove = () => { if (currentPlayer !== "X") return; setValue(currentPlayer); }; return <button onClick={handleMove}>{value}</button>; }',
        'create a turn-based board app',
      ),
    ).toContain('hard-coded player or turn');
    const incompleteCollection = `import { useState } from 'react';
export default function App() {
  const [todos, setTodos] = useState([]);
  const addTodo = (text) => setTodos([...todos, { text, completed: false }]);
  const toggleTodo = (index) => setTodos(todos.map((todo, itemIndex) => itemIndex === index ? { ...todo, completed: !todo.completed } : todo));
  const deleteTodo = (index) => setTodos(todos.filter((_, itemIndex) => itemIndex !== index));
  return (
    <main>
      <h1>Todo App</h1>
      <ul>{todos.map((todo, index) => <li key={index}><input type="checkbox" checked={todo.completed} onChange={() => toggleTodo(index)} /><span>{todo.text}</span><button onClick={() => deleteTodo(index)}>Delete</button></li>)}</ul>
    </main>
  );
}`;
    for (const request of ['build a todo app', 'create a notes app']) {
      expect(validateRequestFulfillment('src/App.jsx', incompleteCollection, request)).toContain(
        'entry flow',
      );
      expect(
        workspaceFulfillsInteractiveRequest({ 'src/App.jsx': incompleteCollection }, request),
      ).toContain('entry flow');
    }
    const unreachableEntry = `import { useState } from 'react';
export default function App() {
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const addItem = () => {
    if (draft.trim()) setItems((current) => [...current, draft.trim()]);
  };
  return <main>
    {isEditing ? <input value={draft} onChange={(event) => setDraft(event.target.value)} /> : <p>No items yet.</p>}
    <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    <button onClick={addItem}>Add</button>
  </main>;
}`;
    expect(
      validateRequestFulfillment('src/App.jsx', unreachableEntry, 'create an item list'),
    ).toContain('reachable entry flow');
    const unrelatedConditional = `import { useState } from 'react';
export default function App() {
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const addItem = () => {
    if (draft.trim()) setItems((current) => [...current, draft.trim()]);
  };
  return <main>
    {isLoading && <p>Loading items...</p>}
    <input value={draft} onChange={(event) => setDraft(event.target.value)} />
    <button onClick={addItem}>Add</button>
    <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
  </main>;
}`;
    expect(
      validateRequestFulfillment('src/App.jsx', unrelatedConditional, 'create an item list'),
    ).toBeNull();
    const mappedOnlyOpener = `import { useState } from 'react';
export default function App() {
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const addItem = () => {
    if (draft.trim()) setItems((current) => [...current, draft.trim()]);
  };
  return <main>
    {isEditing ? <input value={draft} onChange={(event) => setDraft(event.target.value)} /> : <p>No items yet.</p>}
    <ul>{items.map((item) => <li key={item}><span>{item}</span><button onClick={() => setIsEditing(true)}>Edit</button></li>)}</ul>
    <button onClick={addItem}>Add</button>
  </main>;
}`;
    expect(
      validateRequestFulfillment('src/App.jsx', mappedOnlyOpener, 'create an item list'),
    ).toContain('reachable entry flow');
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
      validateRequestFulfillment(
        'src/App.jsx',
        `import { useState } from "react";
import styles from "./App.module.css";
export default function App() {
  const [todoItems, setTodoItems] = useState([]);
  const [newTodo, setNewTodo] = useState("");
  const handleAddTodo = () => {
    if (newTodo.trim() === "") return;
    setTodoItems([...todoItems, newTodo]);
    setNewTodo("");
  };
  const handleDeleteTodo = (index) => {
    const updatedItems = [...todoItems];
    updatedItems.splice(index, 1);
    setTodoItems(updatedItems);
  };
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Todo App</h1>
      <input className={styles.control} value={newTodo} onChange={(e) => setNewTodo(e.target.value)} />
      <button type="button" className={styles.primaryAction} onClick={handleAddTodo}>Add</button>
      <ul className={styles.list}>
        {todoItems.map((item, index) => (
          <li key={index} className={styles.item}>
            {item}
            <button type="button" className={styles.dangerAction} onClick={() => handleDeleteTodo(index)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}`,
        'build a todo app',
      ),
    ).toBeNull();
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

  it('rejects render helpers that are called but never declared', () => {
    const brokenNotes = `import { useState } from 'react';
import styles from './App.module.css';
export default function App() {
  const [notes, setNotes] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const renderNotes = () => notes.map((note) => <button type="button" className={styles.note}>{note.title}</button>);
  return <main className={styles.app}>{renderNotes()}{isEditing ? renderEditState() : renderNotes()}</main>;
}`;

    expect(validateDeclaredFunctionCalls('src/App.jsx', brokenNotes)).toContain(
      "undeclared function 'renderEditState'",
    );
    expect(validateRequestFulfillment('src/App.jsx', brokenNotes, 'create a notes app')).toContain(
      "undeclared function 'renderEditState'",
    );
    expect(
      validateDeclaredFunctionCalls(
        'src/App.jsx',
        `import { useState } from 'react';
export default function App() {
  const [value, setValue] = useState('');
  const renderValue = () => value;
  return <button type="button" onClick={() => setValue('done')}>{renderValue()}</button>;
}`,
      ),
    ).toBeNull();
    expect(
      validateDeclaredFunctionCalls(
        'src/App.jsx',
        `export default function App() {
  const label = \`${'${missingHelper()}'}\`;
  return <p>{label}</p>;
}`,
      ),
    ).toContain("undeclared function 'missingHelper'");
    expect(
      validateDeclaredFunctionCalls(
        'src/App.jsx',
        `export default function App() {
  if (ready) {
    const renderEditState = () => null;
  }
  return <main>{renderEditState()}</main>;
}`,
      ),
    ).toContain("undeclared function 'renderEditState'");
    expect(
      validateDeclaredFunctionCalls(
        'src/App.jsx',
        `export default function App() {
  return <p>{atob(value)}</p>;
}`,
      ),
    ).toBeNull();
    expect(
      validateDeclaredFunctionCalls(
        'src/App.jsx',
        `export default function App() {
  const invoke = (callback) => callback();
  return <button type="button" onClick={() => invoke(() => null)}>Run</button>;
}`,
      ),
    ).toBeNull();
  });

  it('rejects stateful callbacks declared outside the component', () => {
    const source = `import { useState } from 'react';
function App() {
  const [items, setItems] = useState(['One']);
  const [status, setStatus] = useState('Ready');
  const addItem = (item) => {
    setItems([...items, item]);
    setStatus('Added');
  };
  return <main><h1>Items</h1><p>{status}</p><button onClick={() => addItem('Two')}>Add</button></main>;
}
function clearItems() {
  setItems([]);
  setStatus('Empty');
}
export default App;
`;
    expect(validateRequestFulfillment('src/App.jsx', source, 'create an item list')).toContain(
      'outside the component',
    );
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

  it('rejects component payloads that include bootstrap code or CSS-style objects', () => {
    const bootstrap = `import ReactDOM from 'react-dom/client';
export default function App() { return <main />; }
ReactDOM.createRoot(document.getElementById('root')).render(<App />);`;
    const cssObject = `const styles = { minHeight: '100vh', background: '#111' };
export default function App() { return <main />; }`;

    expect(validateGeneratedSourceShape('src/App.jsx', bootstrap)).toContain('ReactDOM bootstrap');
    expect(validateGeneratedSourceShape('src/App.jsx', cssObject)).toContain('CSS-style object');
    expect(validateAIChanges([{ path: 'src/App.jsx', content: bootstrap }]).rejected[0]).toContain(
      'ReactDOM bootstrap',
    );
  });

  it('rejects common small-model boundary mistakes beyond bootstrap and style objects', () => {
    expect(
      validateGeneratedSourceShape('src/App.jsx', '<!DOCTYPE html><html><body>hi</body></html>'),
    ).toContain('HTML document');
    expect(
      validateGeneratedSourceShape(
        'src/App.jsx',
        'export default function App() { return <main><style>.x{}</style></main>; }',
      ),
    ).toContain('<style>');
    expect(
      validateGeneratedSourceShape(
        'src/App.jsx',
        'export default function A() { return null; }\nexport default function B() { return null; }',
      ),
    ).toContain('multiple default exports');
    expect(
      validateGeneratedSourceShape(
        'src/App.jsx',
        'export default function App() { document.getElementById("root"); return null; }',
      ),
    ).toContain('document DOM');
    expect(
      validateGeneratedSourceShape(
        'src/App.jsx',
        'export default function App() { return <main />; }\n...',
      ),
    ).toContain('truncated');
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

  it('rejects undeclared React state setters in components', () => {
    const invalid = `import { useState } from 'react';
export default function App() {
  const [todos, setTodos] = useState([]);
  const handleAdd = () => { setNewTodo(''); };
  return <input onChange={(e) => setNewTodo(e.target.value)} />;
}`;
    expect(validateDeclaredStateVariables('src/App.jsx', invalid)).toContain(
      "Undeclared state setter 'setNewTodo'",
    );

    const valid = `import { useState } from 'react';
export default function App() {
  const [newTodo, setNewTodo] = useState('');
  const [todos, setTodos] = useState([]);
  const handleAdd = () => { setNewTodo(''); };
  return <input value={newTodo} onChange={(e) => setNewTodo(e.target.value)} />;
}`;
    expect(validateDeclaredStateVariables('src/App.jsx', valid)).toBeNull();
  });

  it('does not treat timer APIs or object methods as React state setters', () => {
    const withTimers = `import { useState } from 'react';
export default function App() {
  const [time, setTime] = useState('00:00');
  const [isRunning, setIsRunning] = useState(false);
  const startClock = () => {
    setIsRunning(true);
    const intervalId = setInterval(() => {
      const now = new Date();
      now.setHours(0);
      window.setTimeout(() => setTime('01:00'), 0);
    }, 1000);
    return () => clearInterval(intervalId);
  };
  return <button onClick={startClock}>{time}</button>;
}`;
    expect(validateDeclaredStateVariables('src/App.jsx', withTimers)).toBeNull();
  });
});
