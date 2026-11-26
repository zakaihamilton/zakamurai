import { describe, expect, it } from 'vitest';
import {
  findImportSource,
  getAssociatedFilePath,
  getCssImports,
  getIdentifierForCssFile,
  getImportPathCandidates,
  getImportRanges,
  resolveImportPath,
  resolveRelativePath,
} from './ImportResolver';

describe('ImportResolver', () => {
  describe('getCssImports', () => {
    it('returns empty array for null, undefined, or empty input', () => {
      expect(getCssImports(null)).toEqual([]);
      expect(getCssImports(undefined)).toEqual([]);
      expect(getCssImports('')).toEqual([]);
    });

    it('extracts ESM default, ESM namespace, CJS require, and deduplicated anonymous CSS imports', () => {
      const code = [
        "import styles from './Card.module.css';",
        "import * as theme from './theme.css';",
        "const legacy = require('./legacy.module.css');",
        "import './Card.module.css';",
        "import './global.css';",
      ].join('\n');

      expect(getCssImports(code)).toEqual([
        { identifier: 'styles', importPath: './Card.module.css' },
        { identifier: 'theme', importPath: './theme.css' },
        { identifier: 'legacy', importPath: './legacy.module.css' },
        { identifier: null, importPath: './global.css' },
      ]);
    });
  });

  describe('resolveRelativePath', () => {
    it('resolves @/ alias, non-relative paths, and ./ or ../ relative segments', () => {
      expect(resolveRelativePath('src/a/b.ts', '@/styles/main.css')).toBe('src/styles/main.css');
      expect(resolveRelativePath('src/a/b.ts', 'react')).toBe('react');
      expect(resolveRelativePath('src/a/b/c.ts', './d.ts')).toBe('src/a/b/d.ts');
      expect(resolveRelativePath('src/a/b/c.ts', '../shared/util.ts')).toBe('src/a/shared/util.ts');
    });
  });

  describe('getAssociatedFilePath', () => {
    it('returns null when filePath is missing', () => {
      expect(getAssociatedFilePath(null, {})).toBeNull();
      expect(getAssociatedFilePath('', {})).toBeNull();
    });

    it('finds matching JS/JSX/TSX/TS file for a CSS file by basename or import search', () => {
      const files = {
        'src/Card.module.css': '.card {}',
        'src/Card.tsx': 'export function Card() {}',
        'src/Banner.css': '.banner {}',
        'src/Hero.jsx': "import './Banner.css';",
        'src/Orphan.css': '.orphan {}',
      };

      expect(getAssociatedFilePath('src/Card.module.css', files)).toBe('src/Card.tsx');
      expect(getAssociatedFilePath('src/Banner.css', files)).toBe('src/Hero.jsx');
      expect(getAssociatedFilePath('src/Orphan.css', files)).toBeNull();
    });

    it('finds CSS file for a JS/TS file by identifier, first import, or basename fallback', () => {
      const files = {
        'src/Panel.tsx': [
          "import styles from './Panel.module.css';",
          "import altStyles from './Alt.module.css';",
          "import missing from './Missing.css';",
        ].join('\n'),
        'src/Panel.module.css': '.panel {}',
        'src/Alt.module.css': '.alt {}',
        'src/ImplicitMod.ts': 'const x = 1;',
        'src/ImplicitMod.module.css': '.mod {}',
        'src/ImplicitPlain.js': 'const y = 2;',
        'src/ImplicitPlain.css': '.plain {}',
        'src/BrokenImport.tsx': "import x from './NonExistent.css';",
        'src/NoCss.ts': 'export const a = 1;',
      };

      expect(getAssociatedFilePath('src/Panel.tsx', files, 'altStyles')).toBe('src/Alt.module.css');
      expect(getAssociatedFilePath('src/Panel.tsx', files, 'unknownId')).toBe(
        'src/Panel.module.css',
      );
      expect(getAssociatedFilePath('src/Panel.tsx', files)).toBe('src/Panel.module.css');
      expect(getAssociatedFilePath('src/ImplicitMod.ts', files)).toBe('src/ImplicitMod.module.css');
      expect(getAssociatedFilePath('src/ImplicitPlain.js', files)).toBe('src/ImplicitPlain.css');
      expect(getAssociatedFilePath('src/BrokenImport.tsx', files)).toBeNull();
      expect(getAssociatedFilePath('src/NoCss.ts', files)).toBeNull();
      expect(
        getAssociatedFilePath('src/NotInMap.tsx', { 'src/NotInMap.module.css': '.x {}' }),
      ).toBe('src/NotInMap.module.css');
    });
  });

  describe('getIdentifierForCssFile', () => {
    it('returns null for missing arguments or unmatched CSS files', () => {
      expect(getIdentifierForCssFile(null, 'src/A.tsx', 'src/A.css')).toBeNull();
      expect(getIdentifierForCssFile('', 'src/A.tsx', 'src/A.css')).toBeNull();
      expect(getIdentifierForCssFile("import './A.css';", 'src/A.tsx', 'src/A.css')).toBeNull();
    });

    it('returns the matching import identifier for a resolved CSS file', () => {
      const code = "import cardStyles from './Card.module.css';";
      expect(
        getIdentifierForCssFile(code, 'src/components/Card.tsx', 'src/components/Card.module.css'),
      ).toBe('cardStyles');
      expect(
        getIdentifierForCssFile(code, 'src/components/Card.tsx', 'src/components/Other.css'),
      ).toBeNull();
    });
  });

  describe('getImportPathCandidates', () => {
    it('prioritizes exact path when extension is known and probes extensions first otherwise', () => {
      const withExt = getImportPathCandidates('src/App.tsx');
      expect(withExt[0]).toBe('src/App.tsx');

      const withoutExt = getImportPathCandidates('src/utils');
      expect(withoutExt[0]).toBe('src/utils.js');
      expect(withoutExt.at(-1)).toBe('src/utils');
    });
  });

  describe('resolveImportPath', () => {
    it('returns null for empty importPath or missing file map', () => {
      expect(resolveImportPath('src/App.tsx', '', {})).toBeNull();
    });

    it('resolves @/ alias, relative paths, index files, and skips self-imports', () => {
      const files = {
        'src/App.tsx': '',
        'src/utils/math.ts': '',
        'src/components/Button/index.tsx': '',
        'lib/helper.js': '',
      };

      expect(resolveImportPath('src/App.tsx', '@/utils/math', files)).toBe('src/utils/math.ts');
      expect(resolveImportPath('src/App.tsx', './components/Button', files)).toBe(
        'src/components/Button/index.tsx',
      );
      expect(resolveImportPath('src/App.tsx', 'lib/helper', files)).toBe('lib/helper.js');
      // Self-import returns null
      expect(resolveImportPath('src/App.tsx', './App', { 'src/App.tsx': '' })).toBeNull();
      expect(resolveImportPath('src/App.tsx', './missing', files)).toBeNull();
    });
  });

  describe('getImportRanges', () => {
    it('returns empty array when code is null or empty', () => {
      expect(getImportRanges(null)).toEqual([]);
      expect(getImportRanges('')).toEqual([]);
    });

    it('extracts CSS @import ranges with and without url()', () => {
      const css = '@import \'./reset.css\';\n@import url("./theme.css");';
      const ranges = getImportRanges(css, true);
      expect(ranges.map((r) => ({ ...r, slice: css.slice(r.start, r.end) }))).toEqual([
        { path: './reset.css', start: 9, end: 20, slice: './reset.css' },
        { path: './theme.css', start: 36, end: 47, slice: './theme.css' },
      ]);
    });

    it('extracts ESM import/export and CommonJS require ranges', () => {
      const js = [
        "import App from './App';",
        "export { Foo } from './Foo';",
        'const bar = require("./bar");',
      ].join('\n');
      const ranges = getImportRanges(js);
      expect(ranges.map((r) => r.path)).toEqual(['./App', './Foo', './bar']);
      for (const r of ranges) {
        expect(js.slice(r.start, r.end)).toBe(r.path);
      }
    });
  });

  describe('findImportSource', () => {
    it('returns null when code or identifier is missing or not found', () => {
      expect(findImportSource(null, 'Foo')).toBeNull();
      expect(findImportSource('import Foo from "./foo";', '')).toBeNull();
      expect(findImportSource('const x = 1;', 'Foo')).toBeNull();
    });

    it('finds ESM default, named, aliased named, and namespace imports', () => {
      const code = [
        "import DefaultComp from './Default';",
        "import { Alpha, Beta as AliasedBeta } from './Named';",
        "import * as Utils from './Utils';",
      ].join('\n');

      expect(findImportSource(code, 'DefaultComp')).toEqual({
        importPath: './Default',
        isDefault: true,
        originalName: null,
      });
      expect(findImportSource(code, 'Alpha')).toEqual({
        importPath: './Named',
        isDefault: false,
        originalName: 'Alpha',
      });
      expect(findImportSource(code, 'AliasedBeta')).toEqual({
        importPath: './Named',
        isDefault: false,
        originalName: 'Beta',
      });
      expect(findImportSource(code, 'Utils')).toEqual({
        importPath: './Utils',
        isNamespace: true,
        originalName: null,
      });
    });

    it('finds CommonJS default and destructured (plain and aliased) requires', () => {
      const code = [
        "const CjsDefault = require('./cjs-default');",
        "const { first, second: renamedSecond } = require('./cjs-named');",
      ].join('\n');

      expect(findImportSource(code, 'CjsDefault')).toEqual({
        importPath: './cjs-default',
        isDefault: true,
        originalName: null,
      });
      expect(findImportSource(code, 'first')).toEqual({
        importPath: './cjs-named',
        isDefault: false,
        originalName: 'first',
      });
      expect(findImportSource(code, 'renamedSecond')).toEqual({
        importPath: './cjs-named',
        isDefault: false,
        originalName: 'second',
      });
    });
  });
});
