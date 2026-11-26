import { describe, expect, it } from 'vitest';
import {
  ensureCoLocatedCssModule,
  normalizeSideEffectCssSource,
  rewriteInlineStylesToCssModule,
} from './CssModuleSourceRewriter';
import { createProjectStyleProfile } from './ProjectStyleProfile';

describe('CssModuleSourceRewriter', () => {
  describe('normalizeSideEffectCssSource', () => {
    it('returns null when there are no side-effect CSS imports and fewer than two styles imports', () => {
      const source = `import styles from './App.module.css';
export default function App() {
  return <div className={styles.app}>Hello</div>;
}`;
      expect(normalizeSideEffectCssSource('src/App.jsx', source)).toBeNull();
    });

    it('rewrites relative side-effect .css imports and normalizes string and template classNames', () => {
      const source = `import './App.css';
import '../styles/theme.css';

export default function App() {
  const active = true;
  return (
    <main className="app-shell primary">
      <h1 className="   ">Title</h1>
      <section className={\`card \${active ? 'is-on' : ''} extra-box\`}>
        <span className={\`only-one\`}>One</span>
        <span className={\`\${active ? 'dyn' : ''}\`}>Empty</span>
        <span className={styles.alreadyBound}>Kept</span>
      </section>
    </main>
  );
}`;
      const result = normalizeSideEffectCssSource('src/components/App.jsx', source);
      expect(result).not.toBeNull();
      expect(result?.stylesheets).toEqual([
        'src/components/App.module.css',
        'src/styles/theme.module.css',
      ]);
      expect(result?.content).toContain("import styles from './App.module.css';");
      expect(result?.content).not.toContain("import styles from '../styles/theme.module.css';");
      expect(result?.content).toContain('className={styles["app-shell"] + \' \' + styles.primary}');
      expect(result?.content).toContain('<h1 className={undefined}>Title</h1>');
      expect(result?.content).toContain(
        'className={[styles.card, styles["extra-box"]].filter(Boolean).join(\' \')}',
      );
      expect(result?.content).toContain('<span className={styles["only-one"]}>One</span>');
      expect(result?.content).toContain('<span className={undefined}>Empty</span>');
      expect(result?.content).toContain('<span className={styles.alreadyBound}>Kept</span>');
    });

    it('keeps .module.css side-effect specifiers and deduplicates existing styles imports', () => {
      const source = `import styles from './App.module.css';
import './App.module.css';
import styles from './Extra.module.css';

export default function App() {
  return <div className="panel">Panel</div>;
}`;
      const result = normalizeSideEffectCssSource('src/App.tsx', source);
      expect(result).not.toBeNull();
      expect(result?.stylesheets).toEqual(['src/App.module.css']);
      expect(result?.content.match(/\bimport\s+styles\s+from\b/g)).toHaveLength(1);
      expect(result?.content).toContain('<div className={styles.panel}>Panel</div>');
    });

    it('deduplicates multiple styles imports even without side-effect imports', () => {
      const source = `import styles from './A.module.css';
import styles from './B.module.css';

export default function App() {
  return <div className={\`box\`}>Box</div>;
}`;
      const result = normalizeSideEffectCssSource('src/App.jsx', source);
      expect(result).not.toBeNull();
      expect(result?.stylesheets).toEqual([]);
      expect(result?.content.match(/\bimport\s+styles\s+from\b/g)).toHaveLength(1);
      expect(result?.content).toContain('className={styles.box}');
    });

    it('leaves unclosed or non-template className expressions intact and converts mapped clickable divs', () => {
      const source = `import './App.css';
export default function App() {
  const items = ['a', 'b'];
  return (
    <div className={dynamicClass}>
      {items.map((item) => <div key={item} className="item" onClick={() => console.log(item)}>{item}</div>)}
    </div>
  );
}`;
      const result = normalizeSideEffectCssSource('src/App.jsx', source);
      expect(result).not.toBeNull();
      expect(result?.content).toContain('<div className={dynamicClass}>');
      expect(result?.content).toContain('<button type="button"');
      expect(result?.content).toContain('className={styles.item}');
    });
  });

  describe('rewriteInlineStylesToCssModule', () => {
    it('returns null for non-JSX files or sources without inline styles or style tags', () => {
      expect(
        rewriteInlineStylesToCssModule('src/app.ts', '<div style={{ color: "red" }} />'),
      ).toBeNull();
      expect(
        rewriteInlineStylesToCssModule('src/App.jsx', 'export default () => <div />;'),
      ).toBeNull();
    });

    it('rewrites simple inline style objects with numeric, unitless, and escaped string values', () => {
      const source = `import { useState } from 'react';

export default function App() {
  const [count] = useState(0);
  return (
    <main style={{ paddingTop: 16, zIndex: 5, opacity: 0.85, marginLeft: -4.5, backgroundColor: '#fff', fontFamily: "Inter, 'sans'" }}>
      <span style={{ , content: "hi\\"there", flexGrow: 2, }}>{count}</span>
    </main>
  );
}`;
      const result = rewriteInlineStylesToCssModule('src/App.tsx', source);
      expect(result).not.toBeNull();
      expect(result?.stylesheetPath).toBe('src/App.module.css');
      expect(result?.content).toContain('import styles from "./App.module.css";');
      expect(result?.content).toContain('<main className={styles.inline0}>');
      expect(result?.content).toContain('<span className={styles.inline1}>');
      expect(result?.stylesheet).toContain('padding-top: 16px;');
      expect(result?.stylesheet).toContain('z-index: 5;');
      expect(result?.stylesheet).toContain('opacity: 0.85;');
      expect(result?.stylesheet).toContain('margin-left: -4.5px;');
      expect(result?.stylesheet).toContain('background-color: #fff;');
      expect(result?.stylesheet).toContain("font-family: Inter, 'sans';");
      expect(result?.stylesheet).toContain('content: hi\\"there;');
      expect(result?.stylesheet).toContain('flex-grow: 2;');
    });

    it('falls back to block styling for dynamic or unparseable inline style objects and returns null for unterminated quotes', () => {
      const source = `export default function App({ active, base, getColor }) {
  return (
    <div style={{ color: active ? 'red' : 'blue' }}>
      <span style={{ ...base }} />
      <em style={{}} />
      <b style={{ 123: 'bad' }} />
      <i style={{ color: }} />
      <u style={{ color: getColor() }} />
    </div>
  );
}`;
      const result = rewriteInlineStylesToCssModule('src/App.jsx', source);
      expect(result).not.toBeNull();
      expect(result?.content).toMatch(/^import styles from "\.\/App\.module\.css";\n/);
      expect(result?.content).toContain('<div className={styles.inline0}>');
      expect(result?.content).toContain('<u className={styles.inline5} />');
      expect(result?.stylesheet).toContain(
        '.inline0 {\n  display: block;\n  box-sizing: border-box;\n}',
      );
      expect(result?.stylesheet).toContain(
        '.inline5 {\n  display: block;\n  box-sizing: border-box;\n}',
      );

      // Unterminated string literal inside style={{}} causes extractBalancedBraces to return null
      expect(
        rewriteInlineStylesToCssModule(
          'src/App.jsx',
          'export default function App() { return <u style={{ color: "unterminated }} />; }',
        ),
      ).toBeNull();
    });

    it('extracts <style> blocks, skips duplicate css module imports, and handles style-tag-only files', () => {
      const withExistingImport = `import s from './App.module.css';
export default function App() {
  return (
    <>
      <style jsx>{\`.banner { color: navy; }\`}</style>
      <div style={{ color: 'red' }}>Hi</div>
    </>
  );
}`;
      const res1 = rewriteInlineStylesToCssModule('src/App.jsx', withExistingImport);
      expect(res1).not.toBeNull();
      expect(res1?.content.match(/\.module\.css/g)).toHaveLength(1);
      expect(res1?.stylesheet).toContain('.inline0 {\n  color: red;\n}');
      expect(res1?.stylesheet).toContain('.banner { color: navy; }');

      const styleOnly = `export default function App() {
  return <>
    <style>.card { padding: 8px; }</style>
    <div />
  </>;
}`;
      const res2 = rewriteInlineStylesToCssModule('src/App.jsx', styleOnly);
      expect(res2).not.toBeNull();
      expect(res2?.stylesheet).toBe('.card { padding: 8px; }\n');

      const emptyStyleTag = `export default function App() {
  return <>
    <style>   </style>
    <div />
  </>;
}`;
      expect(rewriteInlineStylesToCssModule('src/App.jsx', emptyStyleTag)).toBeNull();
    });

    it('returns null when style attribute is not an inline object literal or has unbalanced braces', () => {
      expect(
        rewriteInlineStylesToCssModule(
          'src/App.jsx',
          'export default function App() { return <div style={customStyles} />; }',
        ),
      ).toBeNull();
      expect(
        rewriteInlineStylesToCssModule(
          'src/App.jsx',
          'export default function App() { return <div style={{ color: "red" ; }',
        ),
      ).toBeNull();
    });
  });

  describe('ensureCoLocatedCssModule', () => {
    it('returns null for non-JSX files or static components without CSS Module usage', () => {
      expect(ensureCoLocatedCssModule('src/utils.ts', 'export const x = 1;')).toBeNull();
      expect(
        ensureCoLocatedCssModule(
          'src/App.jsx',
          'export default function App() { return <main><h1>Static</h1></main>; }',
        ),
      ).toBeNull();
    });

    it('annotates interactive JSX without existing classNames and generates a stylesheet', () => {
      const source = `import { useState } from 'react';

export default function App() {
  const [items, setItems] = useState(['One']);
  return (
    <main>
      <h1>Board</h1>
      <input value="" onChange={() => {}} />
      <button type="button" onClick={() => setItems([...items, 'Two'])}>Add</button>
      <ul data-testid="items">
        {items.map((item) => (
          <li key={item} className="row">{item}</li>
        ))}
      </ul>
    </main>
  );
}`;
      const result = ensureCoLocatedCssModule('src/App.jsx', source);
      expect(result).not.toBeNull();
      expect(result?.stylesheetPath).toBe('src/App.module.css');
      expect(result?.content).toContain('import styles from "./App.module.css";');
      expect(result?.content).toContain('<main className={styles.app}>');
      expect(result?.content).toContain('<h1 className={styles.title}>');
      expect(result?.content).toContain('<input className={styles.control}');
      expect(result?.content).toContain('<button className={styles.button}');
      expect(result?.content).toContain('<ul className={styles.list} data-testid="items">');
      expect(result?.content).toContain('className={styles.row}');
      expect(result?.stylesheet).toContain('.app');
      expect(result?.stylesheet).toContain('.button');
    });

    it('preserves static components using styles.* without rewriting classNames and supports ProjectStyleProfile', () => {
      const source = `export default function Card() {
  return <section className={styles.card}><h1 className="keep-static">Card</h1></section>;
}`;
      const profile = createProjectStyleProfile({});
      const result = ensureCoLocatedCssModule('src/components/Card.tsx', source, profile);
      expect(result).not.toBeNull();
      expect(result?.stylesheetPath).toBe('src/components/Card.module.css');
      expect(result?.content).toMatch(/^import styles from "\.\/Card\.module\.css";\n/);
      // Static non-interactive layout preserves literal class names and only inserts missing import + stylesheet
      expect(result?.content).toContain('className="keep-static"');
      expect(result?.stylesheet).toContain('.card');
    });

    it('does not add duplicate import when CSS Module import already exists', () => {
      const source = `import ui from './Widget.module.css';
export default function Widget() {
  return <button className={ui.btn} onClick={() => {}}>Go</button>;
}`;
      const result = ensureCoLocatedCssModule('src/Widget.jsx', source);
      expect(result).not.toBeNull();
      expect(result?.content.match(/\.module\.css/g)).toHaveLength(1);
    });
  });
});
