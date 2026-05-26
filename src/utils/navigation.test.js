import { describe, expect, it } from 'vitest';
import {
  findClassInCss,
  findClassReferenceInJs,
  findComponentDefinition,
  findDefiningCssFiles,
  findImportSource,
  findNavigationTargets,
  findReferencingExportJsFiles,
  findReferencingJsFiles,
  getAssociatedFilePath,
  getCssImports,
  getExportRanges,
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

    it('resolves alias paths starting with @/', () => {
      expect(
        resolveRelativePath('src/components/Card/Card.js', '@/components/Button/Button.module.css'),
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

    it('finds standard class reference in JS string literal class list', () => {
      const jsCode = `
        import './global.css';
        const el = <div className="btn primary-btn active">Hello</div>;
      `;
      const result = findClassReferenceInJs(jsCode, 'primary-btn');
      expect(result).not.toBeNull();
      expect(result.line).toBe(3);
      expect(jsCode.substring(result.index, result.index + 'primary-btn'.length)).toBe(
        'primary-btn',
      );
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

  describe('getExportRanges', () => {
    it('extracts named and default exports correctly', () => {
      const code = `
        export const MyComponent = () => {};
        export function calculate() {}
        export class Card {}
        export default function Main() {}
      `;
      const ranges = getExportRanges(code);
      expect(ranges.length).toBe(4);

      expect(ranges[0].name).toBe('MyComponent');
      expect(ranges[0].isDefault).toBe(false);

      expect(ranges[1].name).toBe('calculate');
      expect(ranges[1].isDefault).toBe(false);

      expect(ranges[2].name).toBe('Card');
      expect(ranges[2].isDefault).toBe(false);

      expect(ranges[3].name).toBe('Main');
      expect(ranges[3].isDefault).toBe(true);
    });
  });

  describe('findReferencingExportJsFiles', () => {
    it('finds referencing files for exports', () => {
      const fileContents = {
        'src/components/Button.js': `
          export const Button = () => {};
          export default function ButtonDefault() {}
        `,
        'src/components/Card.js': `
          import { Button } from './Button';
          import ButtonDefault from './Button';
        `,
      };

      const resultsNamed = findReferencingExportJsFiles(
        'src/components/Button.js',
        'Button',
        false,
        fileContents,
      );
      expect(resultsNamed.length).toBe(1);
      expect(resultsNamed[0].filePath).toBe('src/components/Card.js');

      const resultsDefault = findReferencingExportJsFiles(
        'src/components/Button.js',
        'ButtonDefault',
        true,
        fileContents,
      );
      expect(resultsDefault.length).toBe(1);
      expect(resultsDefault[0].filePath).toBe('src/components/Card.js');
    });
  });

  describe('findNavigationTargets with exports', () => {
    it('returns export navigation targets for JS files', () => {
      const fileContents = {
        'src/components/Button.js': 'export const Button = () => {};',
        'src/components/Card.js': "import { Button } from './Button';",
      };
      const targets = findNavigationTargets(
        'export const Button = () => {};',
        false,
        fileContents,
        'src/components/Button.js',
      );
      const exportTargets = targets.filter((t) => t.type === 'export');
      expect(exportTargets.length).toBe(1);
      expect(exportTargets[0].name).toBe('Button');
      expect(exportTargets[0].targets[0].filePath).toBe('src/components/Card.js');
    });
  });

  describe('findImportSource', () => {
    it('resolves ESM default and named imports with aliases and namespaces', () => {
      const code = `
        import Button from './Button';
        import { Card, Table as CustomTable } from '../layout';
        import * as Theme from '@/styles/theme';
      `;
      expect(findImportSource(code, 'Button')).toEqual({
        importPath: './Button',
        isDefault: true,
        originalName: null,
      });
      expect(findImportSource(code, 'Card')).toEqual({
        importPath: '../layout',
        isDefault: false,
        originalName: 'Card',
      });
      expect(findImportSource(code, 'CustomTable')).toEqual({
        importPath: '../layout',
        isDefault: false,
        originalName: 'Table',
      });
      expect(findImportSource(code, 'Theme')).toEqual({
        importPath: '@/styles/theme',
        isNamespace: true,
        originalName: null,
      });
    });

    it('resolves CommonJS require statements', () => {
      const code = `
        const List = require('./List');
        const { Grid, Column: FlexColumn } = require('../grid');
      `;
      expect(findImportSource(code, 'List')).toEqual({
        importPath: './List',
        isDefault: true,
        originalName: null,
      });
      expect(findImportSource(code, 'Grid')).toEqual({
        importPath: '../grid',
        isDefault: false,
        originalName: 'Grid',
      });
      expect(findImportSource(code, 'FlexColumn')).toEqual({
        importPath: '../grid',
        isDefault: false,
        originalName: 'Column',
      });
    });
  });

  describe('findComponentDefinition', () => {
    const fileContents = {
      'src/components/Main.js': `
        import Button from './Button';
        import { Grid } from './Grid';
        
        const LocalComp = () => <div />;
      `,
      'src/components/Button.js': `
        export default function Button() {}
      `,
      'src/components/Grid.js': `
        export const Grid = () => {};
      `,
    };

    it('resolves imported components correctly', () => {
      const defButton = findComponentDefinition('src/components/Main.js', 'Button', fileContents);
      expect(defButton).not.toBeNull();
      expect(defButton.filePath).toBe('src/components/Button.js');
      expect(defButton.loc.line).toBe(2);

      const defGrid = findComponentDefinition('src/components/Main.js', 'Grid', fileContents);
      expect(defGrid).not.toBeNull();
      expect(defGrid.filePath).toBe('src/components/Grid.js');
      expect(defGrid.loc.line).toBe(2);
    });

    it('resolves locally defined components correctly', () => {
      const defLocal = findComponentDefinition('src/components/Main.js', 'LocalComp', fileContents);
      expect(defLocal).not.toBeNull();
      expect(defLocal.filePath).toBe('src/components/Main.js');
      expect(defLocal.loc.line).toBe(5);
    });
  });

  describe('findNavigationTargets with components', () => {
    it('returns component targets for capitalized JSX tags', () => {
      const fileContents = {
        'src/App.js':
          "import Button from './Button';\n<Button onClick={click}><Card.Item>Text</Card.Item></Button>",
        'src/Button.js': 'export default function Button() {}',
      };
      const targets = findNavigationTargets(
        "import Button from './Button';\n<Button onClick={click}><Card.Item>Text</Card.Item></Button>",
        false,
        fileContents,
        'src/App.js',
      );
      const componentTargets = targets.filter((t) => t.type === 'component');
      expect(componentTargets.length).toBe(2);
      expect(componentTargets[0].name).toBe('Button');
      expect(componentTargets[0].targets[0].filePath).toBe('src/Button.js');
      expect(componentTargets[1].name).toBe('Button');
      expect(componentTargets[1].targets[0].filePath).toBe('src/Button.js');
    });
  });

  describe('findNavigationTargets with object variable usages', () => {
    it('returns variable targets for shorthand object properties and spread identifiers', () => {
      const code = [
        'const messages = [];',
        'const generationOptions = {};',
        'const reply = await engine.chat.completions.create({',
        '  messages,',
        '  ...generationOptions,',
        '});',
      ].join('\n');

      const targets = findNavigationTargets(code, false, {}, 'src/test.js');

      const messagesUse = targets.find(
        (t) => t.type === 'variable' && t.name === 'messages' && t.start === 106,
      );
      expect(messagesUse).toBeDefined();
      expect(messagesUse.targets[0].loc.line).toBe(1);

      const generationOptionsUse = targets.find(
        (t) => t.type === 'variable' && t.name === 'generationOptions' && t.start === 121,
      );
      expect(generationOptionsUse).toBeDefined();
      expect(generationOptionsUse.targets[0].loc.line).toBe(2);
    });
  });

  describe('findNavigationTargets with import symbols', () => {
    it('returns targets for destructured named symbols inside imports', () => {
      const fileContents = {
        'src/App.js': 'import { SparklesIcon, CheckIcon } from "./Icons";',
        'src/Icons.js': `
          export const SparklesIcon = () => {};
          export const CheckIcon = () => {};
        `,
      };

      const targets = findNavigationTargets(
        fileContents['src/App.js'],
        false,
        fileContents,
        'src/App.js',
      );

      // We expect 3 targets: 1 for the import path string, and 2 for the individual symbols
      const importTargets = targets.filter((t) => t.type === 'import');
      expect(importTargets.length).toBe(3);

      // Check path target
      const pathTarget = importTargets.find((t) => t.name === './Icons');
      expect(pathTarget).toBeDefined();
      expect(pathTarget.targets[0].filePath).toBe('src/Icons.js');
      expect(pathTarget.targets[0].loc.line).toBe(1);

      // Check SparklesIcon target
      const sparklesTarget = importTargets.find((t) => t.name === 'SparklesIcon');
      expect(sparklesTarget).toBeDefined();
      expect(sparklesTarget.targets[0].filePath).toBe('src/Icons.js');
      expect(sparklesTarget.targets[0].loc.line).toBe(2);
      expect(fileContents['src/App.js'].substring(sparklesTarget.start, sparklesTarget.end)).toBe(
        'SparklesIcon',
      );

      // Check CheckIcon target
      const checkTarget = importTargets.find((t) => t.name === 'CheckIcon');
      expect(checkTarget).toBeDefined();
      expect(checkTarget.targets[0].filePath).toBe('src/Icons.js');
      expect(checkTarget.targets[0].loc.line).toBe(3);
      expect(fileContents['src/App.js'].substring(checkTarget.start, checkTarget.end)).toBe(
        'CheckIcon',
      );
    });

    it('returns targets for named imports with aliases', () => {
      const fileContents = {
        'src/App.js': 'import { SparklesIcon as SI } from "./Icons";',
        'src/Icons.js': 'export const SparklesIcon = () => {};',
      };

      const targets = findNavigationTargets(
        fileContents['src/App.js'],
        false,
        fileContents,
        'src/App.js',
      );

      const importTargets = targets.filter((t) => t.type === 'import');
      expect(importTargets.length).toBe(3); // './Icons', 'SparklesIcon', 'SI'

      // Check SparklesIcon
      const origTarget = importTargets.find((t) => t.name === 'SparklesIcon');
      expect(origTarget).toBeDefined();
      expect(origTarget.targets[0].filePath).toBe('src/Icons.js');
      expect(origTarget.targets[0].loc.line).toBe(1);

      // Check SI
      const aliasTarget = importTargets.find((t) => t.name === 'SI');
      expect(aliasTarget).toBeDefined();
      expect(aliasTarget.targets[0].filePath).toBe('src/Icons.js');
      expect(aliasTarget.targets[0].loc.line).toBe(1);
    });

    it('returns targets for default imports in import statements', () => {
      const fileContents = {
        'src/App.js': 'import Button from "./Button";',
        'src/Button.js': 'export default function Button() {}',
      };

      const targets = findNavigationTargets(
        fileContents['src/App.js'],
        false,
        fileContents,
        'src/App.js',
      );

      const importTargets = targets.filter((t) => t.type === 'import');
      expect(importTargets.length).toBe(2); // './Button', 'Button'

      const buttonTarget = importTargets.find((t) => t.name === 'Button');
      expect(buttonTarget).toBeDefined();
      expect(buttonTarget.targets[0].filePath).toBe('src/Button.js');
      expect(buttonTarget.targets[0].loc.line).toBe(1);
    });

    it('returns targets for namespace imports in import statements', () => {
      const fileContents = {
        'src/App.js': 'import * as theme from "./theme";',
        'src/theme.js': 'export const color = "red";',
      };

      const targets = findNavigationTargets(
        fileContents['src/App.js'],
        false,
        fileContents,
        'src/App.js',
      );

      const importTargets = targets.filter((t) => t.type === 'import');
      expect(importTargets.length).toBe(2); // './theme', 'theme'

      const themeTarget = importTargets.find((t) => t.name === 'theme');
      expect(themeTarget).toBeDefined();
      expect(themeTarget.targets[0].filePath).toBe('src/theme.js');
    });
  });

  describe('findNavigationTargets with standard CSS imports', () => {
    it('returns style navigation targets for standard anonymous CSS imports', () => {
      const fileContents = {
        'src/App.js': `
          import './global.css';
          const el = <div className="btn primary-btn active">Hello</div>;
        `,
        'src/global.css': `
          .btn { padding: 8px; }
          .primary-btn { background: blue; }
        `,
      };

      const targets = findNavigationTargets(
        fileContents['src/App.js'],
        false,
        fileContents,
        'src/App.js',
      );

      const importTargets = targets.filter((t) => t.type === 'import');
      expect(importTargets.find((t) => t.name === './global.css')).toBeDefined();

      const styleTargets = targets.filter((t) => t.type === 'style');
      expect(styleTargets.length).toBe(2);

      const btnTarget = styleTargets.find((t) => t.className === 'btn');
      expect(btnTarget).toBeDefined();
      expect(btnTarget.targets[0].filePath).toBe('src/global.css');
      expect(btnTarget.targets[0].loc.line).toBe(2);

      const primaryBtnTarget = styleTargets.find((t) => t.className === 'primary-btn');
      expect(primaryBtnTarget).toBeDefined();
      expect(primaryBtnTarget.targets[0].filePath).toBe('src/global.css');
      expect(primaryBtnTarget.targets[0].loc.line).toBe(3);

      expect(fileContents['src/App.js'].substring(btnTarget.start, btnTarget.end)).toBe('btn');
      expect(
        fileContents['src/App.js'].substring(primaryBtnTarget.start, primaryBtnTarget.end),
      ).toBe('primary-btn');
    });
  });

  describe('findNavigationTargets with CSS keyframes', () => {
    it('resolves keyframe definitions and usages inside a CSS file', () => {
      const cssCode = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .spinner {
          animation: spin 2s linear infinite;
        }

        .fader {
          animation-name: fade-in;
        }
      `;

      const fileContents = {
        'src/App.css': cssCode,
      };

      const targets = findNavigationTargets(cssCode, true, fileContents, 'src/App.css');

      // 1. Definition check: '@keyframes spin' has definition range, which references usages (type 'export')
      const spinDef = targets.find((t) => t.type === 'export' && t.name === 'spin');
      expect(spinDef).toBeDefined();
      expect(spinDef.targets.length).toBe(1);
      expect(spinDef.targets[0].loc.line).toBe(8); // animation line in spinner class
      expect(cssCode.substring(spinDef.start, spinDef.end)).toBe('spin');

      // 2. Usage check: 'animation: spin ...' (type 'import' pointing to definition)
      const spinUsage = targets.find((t) => t.type === 'import' && t.name === 'spin');
      expect(spinUsage).toBeDefined();
      expect(spinUsage.targets[0].loc.line).toBe(2); // definition line
      expect(cssCode.substring(spinUsage.start, spinUsage.end)).toBe('spin');
    });
  });
});
