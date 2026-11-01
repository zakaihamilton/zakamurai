import { describe, expect, it } from 'vitest';
import {
  autoRepairGeneratedJsxSource,
  repairJsxAttributeAliases,
  repairMissingReactHookImports,
  repairMissingStateSetterDestructuring,
  spliceSymbolScopedWrite,
} from './ActionLoopAutoRepair';

describe('ActionLoopAutoRepair', () => {
  it('injects missing React hook imports when referenced bare in JSX/TSX', () => {
    const source = `import styles from './App.module.css';

export default function App() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    document.title = String(count);
  }, [count]);
  const inputRef = useRef(null);
  return <button ref={inputRef} className={styles.btn} onClick={() => setCount(count + 1)}>{count}</button>;
}`;
    const repaired = repairMissingReactHookImports(source);
    expect(repaired).toContain("import { useState, useEffect, useRef } from 'react';");
  });

  it('merges missing React hooks into an existing named react import', () => {
    const source = `import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  const doubled = useMemo(() => count * 2, [count]);
  return <button onClick={() => setCount(count + 1)}>{doubled}</button>;
}`;
    const repaired = repairMissingReactHookImports(source);
    expect(repaired).toContain("import { useState, useMemo } from 'react';");
  });

  it('merges missing React hooks into an existing default React import', () => {
    const source = `import React from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}`;
    const repaired = repairMissingReactHookImports(source);
    expect(repaired).toContain('import React, { useState } from "react";');
  });

  it('repairs missing state setter destructuring when setX is called', () => {
    const source = `import { useState } from 'react';

export default function Counter() {
  const [count] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}`;
    const repaired = repairMissingStateSetterDestructuring(source);
    expect(repaired).toContain('const [count, setCount] = useState(0);');
  });

  it('normalizes JSX class= and for= attribute aliases', () => {
    const source = `export default function Form() {
  return (
    <form class={styles.form}>
      <label for="email" class="label">Email</label>
      <input id="email" />
    </form>
  );
}`;
    const repaired = repairJsxAttributeAliases(source);
    expect(repaired).toContain('<form className={styles.form}>');
    expect(repaired).toContain('<label htmlFor="email" className="label">');
  });

  it('splices a single updated function into an existing multi-function file while preserving siblings and imports', () => {
    const existing = `import { useState } from 'react';
import styles from './App.module.css';

function formatCount(value) {
  return \`Count: \${value}\`;
}

export default function App() {
  const [count, setCount] = useState(0);
  return <div className={styles.app}>{formatCount(count)}</div>;
}
`;
    const incoming = `import { useEffect } from 'react';

function App() {
  const [count, setCount] = useState(1);
  useEffect(() => {}, [count]);
  return <main className={styles.app}><button onClick={() => setCount(count + 1)}>{formatCount(count)}</button></main>;
}
`;
    const spliced = spliceSymbolScopedWrite(existing, incoming, 'src/App.jsx');
    expect(spliced).toContain('function formatCount(value)');
    expect(spliced).toContain('export default function App()');
    expect(spliced).toContain('setCount(count + 1)');
  });

  it('preserves named export when splicing a named-exported helper function', () => {
    const existing = `export function helperA() {
  return 'a';
}

export function helperB() {
  return 'b';
}
`;
    const incoming = `import { memo } from 'custom-pkg';

function helperB() {
  return memo('b-updated');
}
`;
    const spliced = spliceSymbolScopedWrite(existing, incoming, 'src/helpers.ts');
    expect(spliced).toContain("import { memo } from 'custom-pkg';");
    expect(spliced).toContain('export function helperA()');
    expect(spliced).toContain('export function helperB()');
    expect(spliced).toContain("memo('b-updated')");
  });

  it('runs the full autoRepairGeneratedJsxSource pipeline on JSX/TSX files', () => {
    const existing = `import styles from './App.module.css';

function HelperBadge() {
  return <span>Ready</span>;
}

export default function App() {
  return <div>Old</div>;
}
`;
    const incoming = `function App() {
  const [items] = useState(['one']);
  return (
    <main class={styles.app}>
      <HelperBadge />
      <button onClick={() => setItems([...items, 'two'])}>Add</button>
    </main>
  );
}`;
    const repaired = autoRepairGeneratedJsxSource('src/App.jsx', incoming, existing);
    expect(repaired).toContain("import { useState } from 'react';");
    expect(repaired).toContain('const [items, setItems] = useState');
    expect(repaired).toContain('<main className={styles.app}>');
    expect(repaired).toContain('function HelperBadge()');
    expect(repaired).toContain('export default function App()');
  });
});
