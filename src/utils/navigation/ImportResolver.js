/**
 * Extracts all CSS module imports from JS/JSX code.
 * E.g., import styles from './Card.module.css';
 * Returns an array of objects: [{ identifier, importPath }]
 */
export function getCssImports(jsCode) {
  const imports = [];
  if (!jsCode) return imports;

  // Pattern 1: import styles from './file.module.css'; or import * as styles from './file.module.css';
  const esmRegex = /import\s+(?:(\w+)|\*\s+as\s+(\w+))\s+from\s+['"](.+?\.(?:module\.)?css)['"]/g;
  let match;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex execution loop
  while ((match = esmRegex.exec(jsCode)) !== null) {
    const identifier = match[1] || match[2];
    const importPath = match[3];
    if (identifier) {
      imports.push({ identifier, importPath });
    }
  }

  // Pattern 2: const styles = require('./file.module.css');
  const cjsRegex =
    /(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['"](.+?\.(?:module\.)?css)['"]\s*\)/g;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex execution loop
  while ((match = cjsRegex.exec(jsCode)) !== null) {
    const identifier = match[1];
    const importPath = match[2];
    if (identifier) {
      imports.push({ identifier, importPath });
    }
  }

  // Pattern 3: anonymous import: import './file.module.css';
  const anonRegex = /import\s+['"](.+?\.(?:module\.)?css)['"]/g;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex execution loop
  while ((match = anonRegex.exec(jsCode)) !== null) {
    const importPath = match[1];
    if (!imports.some((imp) => imp.importPath === importPath)) {
      imports.push({ identifier: null, importPath });
    }
  }

  return imports;
}

/**
 * Resolves absolute path from relative path.
 */
export function resolveRelativePath(basePath, relativePath) {
  if (relativePath.startsWith('@/')) {
    return relativePath.replace(/^@\//, 'src/');
  }
  if (!relativePath.startsWith('.')) {
    return relativePath;
  }
  const baseParts = basePath.split('/');
  baseParts.pop(); // Remove file name

  const relParts = relativePath.split('/');
  for (const part of relParts) {
    if (part === '.') {
      continue;
    }
    if (part === '..') {
      baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }
  return baseParts.join('/');
}

/**
 * Resolves the path of the associated CSS module or JS file.
 * Returns the file path string, or null if not found.
 */
export function getAssociatedFilePath(filePath, allFileContents, identifier = null) {
  if (!filePath) return null;

  if (filePath.endsWith('.css')) {
    // Current is CSS. Find JS/JSX/TS/TSX.
    const baseDir = filePath.substring(0, filePath.lastIndexOf('/') + 1);
    const baseName = filePath
      .substring(filePath.lastIndexOf('/') + 1)
      .replace(/(\.module)?\.css$/, '');

    const extensions = ['.js', '.jsx', '.tsx', '.ts'];
    for (const ext of extensions) {
      const testPath = `${baseDir}${baseName}${ext}`;
      if (allFileContents[testPath] !== undefined) {
        return testPath;
      }
    }

    // Fall back to searching all files to see if any file imports this CSS module
    const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
    for (const [path, content] of Object.entries(allFileContents)) {
      if (
        path.endsWith('.js') ||
        path.endsWith('.jsx') ||
        path.endsWith('.ts') ||
        path.endsWith('.tsx')
      ) {
        if (content?.includes(fileName)) {
          return path;
        }
      }
    }
  } else {
    // Current is JS/JSX/TS/TSX. Find the CSS module.
    const content = allFileContents[filePath];
    if (content) {
      const imports = getCssImports(content);
      if (imports.length > 0) {
        let matchedImport = null;
        if (identifier) {
          matchedImport = imports.find((imp) => imp.identifier === identifier);
        }
        // If no match found by identifier, or no identifier specified, fallback to the first CSS import
        if (!matchedImport) {
          matchedImport = imports[0];
        }

        if (matchedImport?.importPath) {
          const resolved = resolveRelativePath(filePath, matchedImport.importPath);
          if (allFileContents[resolved] !== undefined) {
            return resolved;
          }
        }
      }
    }

    // Fall back to same base name with .module.css in the same directory
    const baseDir = filePath.substring(0, filePath.lastIndexOf('/') + 1);
    const baseName = filePath.substring(filePath.lastIndexOf('/') + 1).replace(/\.[a-zA-Z]+$/, '');
    const testPath = `${baseDir}${baseName}.module.css`;
    if (allFileContents[testPath] !== undefined) {
      return testPath;
    }
    const testPathCss = `${baseDir}${baseName}.css`;
    if (allFileContents[testPathCss] !== undefined) {
      return testPathCss;
    }
  }

  return null;
}

/**
 * Resolves the identifier used to import a specific CSS file in a JS file.
 */
export function getIdentifierForCssFile(jsCode, jsFilePath, cssFilePath) {
  if (!jsCode || !jsFilePath || !cssFilePath) return null;
  const imports = getCssImports(jsCode);
  for (const imp of imports) {
    if (imp.identifier && imp.importPath) {
      const resolved = resolveRelativePath(jsFilePath, imp.importPath);
      if (resolved === cssFilePath) {
        return imp.identifier;
      }
    }
  }
  return null;
}

/**
 * Resolves the absolute path of an imported file, checking for aliases,
 * relative paths, common extensions, and directory index files.
 */
export function resolveImportPath(jsFilePath, importPath, allFileContents) {
  if (!importPath || !allFileContents) return null;

  let resolved = importPath;
  if (importPath.startsWith('@/')) {
    resolved = importPath.replace(/^@\//, 'src/');
  } else if (importPath.startsWith('.')) {
    resolved = resolveRelativePath(jsFilePath, importPath);
  }

  // List of possible resolutions in priority order:
  const candidates = [
    resolved, // As-is
    `${resolved}.js`,
    `${resolved}.jsx`,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}.css`,
    `${resolved}.json`,
    `${resolved}.svg`,
    `${resolved}.png`,
    `${resolved}.jpg`,
    `${resolved}.jpeg`,
    `${resolved}.gif`,
    `${resolved}.webp`,
    `${resolved}/index.js`,
    `${resolved}/index.jsx`,
    `${resolved}/index.ts`,
    `${resolved}/index.tsx`,
  ];

  for (const candidate of candidates) {
    if (candidate === jsFilePath) {
      continue;
    }
    if (allFileContents[candidate] !== undefined) {
      return candidate;
    }
  }

  return null;
}

/**
 * Extracts ranges (start and end indexes) of import and require path strings in JS/TS or CSS code.
 */
export function getImportRanges(code, isCss = false) {
  const ranges = [];
  if (!code) return ranges;

  if (isCss) {
    // Pattern: @import './file.css'; or @import url('./file.css');
    const cssImportRegex = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?/g;
    let match;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex execution loop
    while ((match = cssImportRegex.exec(code)) !== null) {
      const path = match[1];
      const fullMatch = match[0];
      const pathIndex = match.index + fullMatch.indexOf(path);
      ranges.push({
        path,
        start: pathIndex,
        end: pathIndex + path.length,
      });
    }
    return ranges;
  }

  // Pattern 1: ES6 imports and exports
  const es6Regex = /\b(import|export)\s+(?:[^'"]*?\bfrom\s+)?(['"])([^'"]+)\2/g;
  let match;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex execution loop
  while ((match = es6Regex.exec(code)) !== null) {
    const quote = match[2];
    const path = match[3];
    const fullMatch = match[0];
    const quoteIndex = fullMatch.indexOf(quote);
    const pathIndex = match.index + quoteIndex + 1;
    ranges.push({
      path,
      start: pathIndex,
      end: pathIndex + path.length,
    });
  }

  // Pattern 2: CommonJS require
  const requireRegex = /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex execution loop
  while ((match = requireRegex.exec(code)) !== null) {
    const quote = match[1];
    const path = match[2];
    const fullMatch = match[0];
    const quoteIndex = fullMatch.indexOf(quote);
    const pathIndex = match.index + quoteIndex + 1;
    ranges.push({
      path,
      start: pathIndex,
      end: pathIndex + path.length,
    });
  }

  return ranges;
}

/**
 * Parses ESM and CommonJS imports to trace the source file and naming of an imported symbol.
 */
export function findImportSource(jsCode, identifier) {
  if (!jsCode || !identifier) return null;

  // ESM Imports
  const esmImportRegex = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex execution loop
  while ((match = esmImportRegex.exec(jsCode)) !== null) {
    const importClause = match[1].trim();
    const importPath = match[2];

    const defaultRegex = new RegExp(`^${identifier}\\b`);
    if (defaultRegex.test(importClause)) {
      return { importPath, isDefault: true, originalName: null };
    }

    const bracesMatch = importClause.match(/\{([\s\S]*?)\}/);
    if (bracesMatch) {
      const namedImports = bracesMatch[1].split(',');
      for (let item of namedImports) {
        item = item.trim();
        if (item.includes(' as ')) {
          const [orig, alias] = item.split(/\s+as\s+/);
          if (alias.trim() === identifier) {
            return { importPath, isDefault: false, originalName: orig.trim() };
          }
        } else if (item === identifier) {
          return { importPath, isDefault: false, originalName: identifier };
        }
      }
    }

    const namespaceRegex = new RegExp(`\\*\\s+as\\s+${identifier}\\b`);
    if (namespaceRegex.test(importClause)) {
      return { importPath, isNamespace: true, originalName: null };
    }
  }

  // CommonJS requires
  const cjsDefaultRegex = new RegExp(
    `(?:const|let|var)\\s+${identifier}\\s*=\\s*require\\(\\s*['"]([^'"]+)['"]\\s*\\)`,
  );
  const cjsMatch = jsCode.match(cjsDefaultRegex);
  if (cjsMatch) {
    return { importPath: cjsMatch[1], isDefault: true, originalName: null };
  }

  const cjsDestructureRegex =
    /(?:const|let|var)\s*\{([\s\S]*?)\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex execution loop
  while ((match = cjsDestructureRegex.exec(jsCode)) !== null) {
    const destructureClause = match[1];
    const importPath = match[2];
    const items = destructureClause.split(',');
    for (let item of items) {
      item = item.trim();
      if (item.includes(':')) {
        const [orig, alias] = item.split(':');
        if (alias.trim() === identifier) {
          return { importPath, isDefault: false, originalName: orig.trim() };
        }
      } else if (item === identifier) {
        return { importPath, isDefault: false, originalName: identifier };
      }
    }
  }

  return null;
}
