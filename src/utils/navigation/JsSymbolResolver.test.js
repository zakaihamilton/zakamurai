import { describe, expect, it } from 'vitest';
import {
  findClassReferenceInJs,
  findComponentDefinition,
  findReferencingJsFiles,
  getExportRanges,
  getIdentifierForCssFile,
  getLocFromIndex,
} from './JsSymbolResolver';

describe('JsSymbolResolver', () => {
  describe('getLocFromIndex', () => {
    it('returns default location for empty or invalid inputs', () => {
      expect(getLocFromIndex('', 5)).toEqual({ line: 1, col: 1, index: 0 });
      expect(getLocFromIndex('abc', undefined)).toEqual({ line: 1, col: 1, index: 0 });
      expect(getLocFromIndex('abc', -1)).toEqual({ line: 1, col: 1, index: 0 });
    });

    it('computes line and column for multiline code', () => {
      const code = 'line1\nline2\nline3';
      const index = code.indexOf('line3');
      expect(getLocFromIndex(code, index)).toEqual({
        line: 3,
        col: 1,
        index,
      });
    });
  });

  describe('getIdentifierForCssFile', () => {
    it('returns the import identifier for a matching CSS module', () => {
      const jsCode = "import styles from './Card.module.css';\nimport theme from './Theme.css';";
      const identifier = getIdentifierForCssFile(jsCode, 'src/Card.js', 'src/Card.module.css');
      expect(identifier).toBe('styles');
    });

    it('returns null when no matching import exists', () => {
      expect(getIdentifierForCssFile('', 'src/App.js', 'src/App.css')).toBe(null);
      expect(
        getIdentifierForCssFile('import x from "./other.css";', 'src/App.js', 'src/App.css'),
      ).toBe(null);
    });
  });

  describe('findClassReferenceInJs', () => {
    it('finds dot-notation class references with specific CSS path', () => {
      const jsCode =
        "import styles from './App.module.css';\nconst el = <div className={styles.primary}>Hi</div>;";
      const loc = findClassReferenceInJs(jsCode, 'primary', 'src/App.js', 'src/App.module.css');
      expect(loc).not.toBeNull();
      expect(jsCode.substring(loc.index, loc.index + 'styles.primary'.length)).toBe(
        'styles.primary',
      );
    });

    it('finds bracket-notation class references', () => {
      const jsCode =
        "import styles from './App.module.css';\nconst el = <div className={styles['primary-btn']}>Hi</div>;";
      const loc = findClassReferenceInJs(jsCode, 'primary-btn');
      expect(loc).not.toBeNull();
      expect(loc.line).toBe(2);
    });

    it('falls back to string literal class names for standard CSS imports', () => {
      const jsCode = 'import \'./global.css\';\nconst el = <div className="btn primary">Hi</div>;';
      const loc = findClassReferenceInJs(jsCode, 'primary');
      expect(loc).not.toBeNull();
      expect(jsCode.substring(loc.index, loc.index + 'primary'.length)).toBe('primary');
    });

    it('returns null when class is not referenced', () => {
      expect(findClassReferenceInJs('const x = 1;', 'missing')).toBe(null);
    });
  });

  describe('findReferencingJsFiles', () => {
    const fileContents = {
      'src/Card.js':
        "import styles from './Card.module.css';\nconst el = <div className={styles.card}>Hello</div>;",
      'src/Card.module.css': '.card { border: 1px; }',
      'src/Card.tsx':
        "import styles from './Card.module.css';\nconst el = <div className={styles.card}>TSX</div>;",
    };

    it('finds referencing JS and TSX files', () => {
      const results = findReferencingJsFiles('src/Card.module.css', 'card', fileContents);
      expect(results.map((r) => r.filePath)).toEqual(
        expect.arrayContaining(['src/Card.js', 'src/Card.tsx']),
      );
    });

    it('returns empty array for missing inputs or unmatched class', () => {
      expect(findReferencingJsFiles(null, 'card', fileContents)).toEqual([]);
      expect(findReferencingJsFiles('src/Card.module.css', 'card', null)).toEqual([]);
      expect(findReferencingJsFiles('src/Card.module.css', 'missing', fileContents)).toEqual([]);
    });
  });

  describe('findComponentDefinition', () => {
    const fileContents = {
      'src/Main.js': "import Button from './Button';\nconst Local = () => null;",
      'src/Button.js': 'export default function Button() {}',
    };

    it('resolves default-imported component definitions', () => {
      const def = findComponentDefinition('src/Main.js', 'Button', fileContents);
      expect(def).toEqual({
        filePath: 'src/Button.js',
        fileName: 'Button.js',
        loc: expect.objectContaining({ line: 1 }),
      });
    });

    it('resolves locally defined components', () => {
      const def = findComponentDefinition('src/Main.js', 'Local', fileContents);
      expect(def?.filePath).toBe('src/Main.js');
      expect(def?.loc.line).toBe(2);
    });

    it('returns null when component cannot be resolved', () => {
      expect(findComponentDefinition('src/Main.js', 'Missing', fileContents)).toBe(null);
      expect(findComponentDefinition(null, 'Button', fileContents)).toBe(null);
    });
  });

  describe('getExportRanges', () => {
    it('extracts named and default export ranges', () => {
      const code = 'export const Foo = 1;\nexport default function Bar() {}';
      const ranges = getExportRanges(code);
      expect(ranges.some((r) => r.name === 'Foo' && !r.isDefault)).toBe(true);
      expect(ranges.some((r) => r.name === 'Bar' && r.isDefault)).toBe(true);
    });

    it('returns empty array for empty code', () => {
      expect(getExportRanges('')).toEqual([]);
    });
  });
});
