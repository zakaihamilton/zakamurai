import { describe, expect, it } from 'vitest';
import {
  findClassInCss,
  findClassReferenceInJs,
  findDefiningCssFiles,
  findReferencingJsFiles,
  getAssociatedFilePath,
  getCssImports,
  getImportRanges,
  getStyleAtCursor,
  resolveImportPath,
  resolveRelativePath,
} from './navigation';

describe('navigation utils', () => {
  describe('getCssImports', () => {
    it('extracts ESM imports', () => {
      const code = `
        import styles from './Card.module.css';
        import * as theme from "../Theme.module.css";
        import './global.module.css';
      `;
      const result = getCssImports(code);
      expect(result).toEqual([
        { identifier: 'styles', importPath: './Card.module.css' },
        { identifier: 'theme', importPath: '../Theme.module.css' },
        { identifier: null, importPath: './global.module.css' },
      ]);
    });

    it('extracts CommonJS imports', () => {
      const code = "const layout = require('./Layout.module.css');";
      const result = getCssImports(code);
      expect(result).toEqual([{ identifier: 'layout', importPath: './Layout.module.css' }]);
    });
  });

  describe('getStyleAtCursor', () => {
    describe('in CSS mode', () => {
      const cssCode = '.container { color: red; }\n.header-title {\n  font-size: 14px;\n}';

      it('resolves class name when clicking exactly on the dot or within the class word', () => {
        // Clicking on '.' of '.container'
        expect(getStyleAtCursor(cssCode, 0, true)).toEqual({
          className: 'container',
          identifier: null,
        });
        // Clicking on 'c' of '.container'
        expect(getStyleAtCursor(cssCode, 1, true)).toEqual({
          className: 'container',
          identifier: null,
        });
        // Clicking on 'r' of '.container'
        expect(getStyleAtCursor(cssCode, 9, true)).toEqual({
          className: 'container',
          identifier: null,
        });
      });

      it('resolves class name using regex fallback when clicking on the class word itself without holding dot', () => {
        // Clicking inside 'header-title' (index 30 is within 'header-title')
        expect(getStyleAtCursor(cssCode, 30, true)).toEqual({
          className: 'header-title',
          identifier: null,
        });
      });

      it('returns null when clicking on non-class elements like properties or selectors', () => {
        // Clicking on 'color'
        expect(getStyleAtCursor(cssCode, 15, true)).toBe(null);
      });
    });

    describe('in JS/JSX mode', () => {
      const jsCode =
        "const element = <div className={styles.container}>Hello <span className={theme['header-title']}>World</span></div>;";

      it('resolves style name in dot notation (clicking className)', () => {
        // Index of 'container' is 38
        expect(getStyleAtCursor(jsCode, 38, false)).toEqual({
          className: 'container',
          identifier: 'styles',
        });
      });

      it('resolves style name in dot notation (clicking identifier)', () => {
        // Click on 's' in styles (index 32)
        expect(getStyleAtCursor(jsCode, 32, false)).toEqual({
          className: 'container',
          identifier: 'styles',
        });
      });

      it('resolves style name in bracket notation (clicking className)', () => {
        // Index of 'header-title' is 82
        expect(getStyleAtCursor(jsCode, 82, false)).toEqual({
          className: 'header-title',
          identifier: 'theme',
        });
      });

      it('resolves style name in bracket notation (clicking identifier)', () => {
        // Index of 'theme' (index 73)
        expect(getStyleAtCursor(jsCode, 73, false)).toEqual({
          className: 'header-title',
          identifier: 'theme',
        });
      });

      it('returns null for non-style words', () => {
        // Click on 'element'
        expect(getStyleAtCursor(jsCode, 6, false)).toBe(null);
      });
    });
  });

  describe('resolveRelativePath', () => {
    it('resolves paths correctly relative to base paths', () => {
      expect(resolveRelativePath('src/components/Card/Card.js', './Card.module.css')).toBe(
        'src/components/Card/Card.module.css',
      );
      expect(
        resolveRelativePath('src/components/Card/Card.js', '../Button/Button.module.css'),
      ).toBe('src/components/Button/Button.module.css');
    });

    it('returns original path if not starting with dots', () => {
      expect(resolveRelativePath('src/components/Card.js', 'package-name')).toBe('package-name');
    });
  });

  describe('getAssociatedFilePath', () => {
    const fileContents = {
      'src/components/Card.js':
        "import styles from './Card.module.css';\nimport theme from './Theme.module.css';\nexport default function Card() {}",
      'src/components/Card.module.css': '.card { border: 1px; }',
      'src/components/Theme.module.css': '.title { color: blue; }',
      'src/components/Header.jsx': "import headerStyles from './Header.module.css';",
      'src/components/Header.module.css': '.header { padding: 10px; }',
    };

    it('resolves CSS path from JS file using matching identifier', () => {
      expect(getAssociatedFilePath('src/components/Card.js', fileContents, 'styles')).toBe(
        'src/components/Card.module.css',
      );
      expect(getAssociatedFilePath('src/components/Card.js', fileContents, 'theme')).toBe(
        'src/components/Theme.module.css',
      );
    });

    it('falls back to the first CSS import if identifier does not match or is null', () => {
      expect(getAssociatedFilePath('src/components/Card.js', fileContents)).toBe(
        'src/components/Card.module.css',
      );
      expect(getAssociatedFilePath('src/components/Card.js', fileContents, 'non-existent')).toBe(
        'src/components/Card.module.css',
      );
    });

    it('resolves JS path from CSS file', () => {
      expect(getAssociatedFilePath('src/components/Card.module.css', fileContents)).toBe(
        'src/components/Card.js',
      );
    });

    it('resolves using same base name as fallback when explicit import match fails', () => {
      expect(getAssociatedFilePath('src/components/Header.module.css', fileContents)).toBe(
        'src/components/Header.jsx',
      );
    });

    it('returns null when no association can be found', () => {
      expect(getAssociatedFilePath('src/utils/navigation.js', fileContents)).toBe(null);
    });
  });

  describe('findClassInCss', () => {
    const cssCode = '.card {\n  color: red;\n}\n\n.title-main {\n  font-size: 20px;\n}';

    it('finds the position of a class selector', () => {
      const result = findClassInCss(cssCode, 'title-main');
      expect(result).not.toBeNull();
      expect(result.line).toBe(5);
      expect(result.index).toBe(25); // index of '.title-main'
    });

    it('returns null if the class selector does not exist', () => {
      expect(findClassInCss(cssCode, 'non-existent')).toBeNull();
    });
  });

  describe('findClassReferenceInJs', () => {
    const jsCode =
      "import theme from './Theme.module.css';\nconst el = <div className={theme.titleMain}>Hello <span className={theme['header-title']}>World</span></div>;";

    it('finds reference using specific css path mapping to identifier', () => {
      const result = findClassReferenceInJs(
        jsCode,
        'titleMain',
        'src/components/Card.js',
        'src/components/Theme.module.css',
      );
      expect(result).not.toBeNull();
      expect(result.line).toBe(2);
      expect(jsCode.substring(result.index, result.index + 'theme.titleMain'.length)).toBe(
        'theme.titleMain',
      );
    });

    it('finds reference using auto-extracted identifiers when no specific path is given', () => {
      const result = findClassReferenceInJs(jsCode, 'header-title');
      expect(result).not.toBeNull();
      expect(result.line).toBe(2);
      expect(jsCode.substring(result.index, result.index + "theme['header-title']".length)).toBe(
        "theme['header-title']",
      );
    });

    it('returns null if reference does not exist', () => {
      expect(findClassReferenceInJs(jsCode, 'non-existent')).toBeNull();
    });
  });

  describe('findReferencingJsFiles', () => {
    const fileContents = {
      'src/components/Card.js':
        "import styles from './Card.module.css';\nconst el = <div className={styles.card}>Hello</div>;",
      'src/components/Card.module.css': '.card { border: 1px; }',
      'src/components/Sidebar.js':
        "import styles from './Card.module.css';\nconst el = <div className={styles.card}>Sidebar</div>;",
      'src/components/Theme.module.css': '.card { color: red; }',
    };

    it('finds all JS files referencing a class in a CSS file', () => {
      const results = findReferencingJsFiles(
        'src/components/Card.module.css',
        'card',
        fileContents,
      );
      expect(results.length).toBe(2);
      expect(results.map((r) => r.filePath)).toContain('src/components/Card.js');
      expect(results.map((r) => r.filePath)).toContain('src/components/Sidebar.js');
    });

    it('returns empty array if no files reference it', () => {
      const results = findReferencingJsFiles(
        'src/components/Card.module.css',
        'non-existent',
        fileContents,
      );
      expect(results).toEqual([]);
    });
  });

  describe('findDefiningCssFiles', () => {
    const fileContents = {
      'src/components/Card.js':
        "import styles from './Card.module.css';\nimport theme from './Theme.module.css';\nconst el = <div className={styles.card}>Hello</div>;",
      'src/components/Card.module.css': '.card { border: 1px; }',
      'src/components/Theme.module.css': '.card { color: red; }\n.themeOnly { display: block; }',
    };

    it('finds CSS files that define the class referenced in JS with specific identifier', () => {
      const results = findDefiningCssFiles(
        'src/components/Card.js',
        'card',
        'styles',
        fileContents,
      );
      expect(results.length).toBe(1);
      expect(results[0].filePath).toBe('src/components/Card.module.css');
    });

    it('finds CSS files when checking all imports (no identifier)', () => {
      const results = findDefiningCssFiles('src/components/Card.js', 'card', null, fileContents);
      expect(results.length).toBe(2);
      expect(results.map((r) => r.filePath)).toContain('src/components/Card.module.css');
      expect(results.map((r) => r.filePath)).toContain('src/components/Theme.module.css');
    });
  });

  describe('getImportRanges', () => {
    it('extracts ES6 import and export ranges accurately', () => {
      const code = `
        import styles from './Card.module.css';
        import { isMac } from '@/utils/os';
        export { default } from './Button';
      `;
      const result = getImportRanges(code);
      expect(result.length).toBe(3);

      expect(result[0].path).toBe('./Card.module.css');
      expect(code.substring(result[0].start, result[0].end)).toBe('./Card.module.css');

      expect(result[1].path).toBe('@/utils/os');
      expect(code.substring(result[1].start, result[1].end)).toBe('@/utils/os');

      expect(result[2].path).toBe('./Button');
      expect(code.substring(result[2].start, result[2].end)).toBe('./Button');
    });

    it('extracts CommonJS require ranges accurately', () => {
      const code = "const utils = require('./utils');";
      const result = getImportRanges(code);
      expect(result.length).toBe(1);
      expect(result[0].path).toBe('./utils');
      expect(code.substring(result[0].start, result[0].end)).toBe('./utils');
    });

    it('extracts CSS @import ranges accurately', () => {
      const code = "@import './variables.css';\n@import url('./Theme.module.css');";
      const result = getImportRanges(code, true);
      expect(result.length).toBe(2);

      expect(result[0].path).toBe('./variables.css');
      expect(code.substring(result[0].start, result[0].end)).toBe('./variables.css');

      expect(result[1].path).toBe('./Theme.module.css');
      expect(code.substring(result[1].start, result[1].end)).toBe('./Theme.module.css');
    });
  });

  describe('resolveImportPath', () => {
    const fileContents = {
      'src/utils/os.js': 'export const isMac = true;',
      'src/components/Card/Card.js': 'export default function Card() {}',
      'src/components/Card/Card.module.css': '.card {}',
      'src/components/Card/Card.css': '.card-legacy {}',
      'src/components/Button/index.js': 'export default function Button() {}',
      'src/assets/logo.svg': '<svg></svg>',
      'src/assets/avatar.png': 'binary_image_data',
    };

    it('resolves relative imports with implicit extensions', () => {
      const resolved = resolveImportPath(
        'src/components/Card/Card.js',
        './Card.module.css',
        fileContents,
      );
      expect(resolved).toBe('src/components/Card/Card.module.css');
    });

    it('resolves alias @/ imports with implicit extensions', () => {
      const resolved = resolveImportPath('src/components/Card/Card.js', '@/utils/os', fileContents);
      expect(resolved).toBe('src/utils/os.js');
    });

    it('resolves directory index imports', () => {
      const resolved = resolveImportPath('src/components/Card/Card.js', '../Button', fileContents);
      expect(resolved).toBe('src/components/Button/index.js');
    });

    it('resolves image and standard CSS imports with and without extensions', () => {
      // With extension
      const resolvedSvg = resolveImportPath(
        'src/components/Card/Card.js',
        '@/assets/logo.svg',
        fileContents,
      );
      expect(resolvedSvg).toBe('src/assets/logo.svg');

      // Without extension
      const resolvedPng = resolveImportPath(
        'src/components/Card/Card.js',
        '../../assets/avatar',
        fileContents,
      );
      expect(resolvedPng).toBe('src/assets/avatar.png');

      // Standard CSS file without extension
      const resolvedCss = resolveImportPath('src/components/Card/Card.js', './Card', fileContents);
      expect(resolvedCss).toBe('src/components/Card/Card.css');
    });

    it('returns null if the file does not exist', () => {
      const resolved = resolveImportPath(
        'src/components/Card/Card.js',
        '@/nonexistent',
        fileContents,
      );
      expect(resolved).toBeNull();
    });
  });
});
