/**
 * Extracts all CSS module imports from JS/JSX code.
 * E.g., import styles from './Card.module.css';
 * Returns an array of objects: [{ identifier, importPath }]
 */
export function getCssImports(jsCode) {
  const imports = [];
  if (!jsCode) return imports;

  // Pattern 1: import styles from './file.module.css'; or import * as styles from './file.module.css';
  const esmRegex = /import\s+(?:(\w+)|\*\s+as\s+(\w+))\s+from\s+['"](.+?\.module\.css)['"]/g;
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
  const cjsRegex = /(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['"](.+?\.module\.css)['"]\s*\)/g;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex execution loop
  while ((match = cjsRegex.exec(jsCode)) !== null) {
    const identifier = match[1];
    const importPath = match[2];
    if (identifier) {
      imports.push({ identifier, importPath });
    }
  }

  // Pattern 3: anonymous import: import './file.module.css';
  const anonRegex = /import\s+['"](.+?\.module\.css)['"]/g;
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
 * Resolves the style class name at a given index in the code.
 * For JS/JSX: looks for `identifier.className` or `identifier['className']`.
 * For CSS: looks for `.className`.
 * Returns `{ className, identifier }` or null.
 */
export function getStyleAtCursor(code, index, isCss) {
  if (!code || index === undefined || index < 0 || index > code.length) return null;

  if (isCss) {
    // If clicking on '.', adjust index to the first character of the word
    let wordIndex = index;
    if (
      code[wordIndex] === '.' &&
      wordIndex < code.length - 1 &&
      /[a-zA-Z0-9_\-]/.test(code[wordIndex + 1])
    ) {
      wordIndex++;
    }

    // Now find the start and end of the word containing wordIndex
    let start = wordIndex;
    while (start > 0 && /[a-zA-Z0-9_\-]/.test(code[start - 1])) {
      start--;
    }
    let end = wordIndex;
    while (end < code.length && /[a-zA-Z0-9_\-]/.test(code[end])) {
      end++;
    }

    const word = code.slice(start, end);
    if (!word) return null;

    // Check if the character before 'start' is '.'
    if (start > 0 && code[start - 1] === '.') {
      return { className: word, identifier: null };
    }

    // Fallback: Check if the word itself is a class selector in the CSS code
    if (/^[a-zA-Z0-9_\-]+$/.test(word)) {
      const regex = new RegExp(`\\.${word}\\b`);
      if (regex.test(code)) {
        return { className: word, identifier: null };
      }
    }
    return null;
  }

  // We are in JS/JSX.
  // Extract the word under the cursor first.
  let start = index;
  let end = index;
  while (start > 0 && /[a-zA-Z0-9_\-]/.test(code[start - 1])) {
    start--;
  }
  while (end < code.length && /[a-zA-Z0-9_\-]/.test(code[end])) {
    end++;
  }
  const word = code.slice(start, end);
  if (!word || !/^[a-zA-Z0-9_\-]+$/.test(word)) return null;

  // Case 1: Dot notation - Cursor is on the className (e.g., word = "title" in "styles.title")
  if (start > 0 && code[start - 1] === '.') {
    const idEnd = start - 1; // Index of '.'
    let idStart = idEnd;
    while (idStart > 0 && /[a-zA-Z0-9_]/.test(code[idStart - 1])) {
      idStart--;
    }
    const identifier = code.slice(idStart, idEnd);
    if (identifier) {
      return { className: word, identifier };
    }
  }

  // Case 2: Bracket notation - Cursor is on the className (e.g., word = "title" in "styles['title']")
  const beforeStr = code.slice(Math.max(0, start - 2), start);
  if (beforeStr === "['" || beforeStr === '["') {
    const idEnd = start - 2;
    let idStart = idEnd;
    while (idStart > 0 && /[a-zA-Z0-9_]/.test(code[idStart - 1])) {
      idStart--;
    }
    const identifier = code.slice(idStart, idEnd);
    if (identifier) {
      return { className: word, identifier };
    }
  }

  // Case 3: Cursor is on the identifier in dot notation (e.g., word = "styles" in "styles.title")
  if (end < code.length && code[end] === '.') {
    const classStart = end + 1;
    let classEnd = classStart;
    while (classEnd < code.length && /[a-zA-Z0-9_\-]/.test(code[classEnd])) {
      classEnd++;
    }
    const className = code.slice(classStart, classEnd);
    if (className) {
      return { className, identifier: word };
    }
  }

  // Case 4: Cursor is on the identifier in bracket notation (e.g., word = "styles" in "styles['title']")
  const afterStr = code.slice(end, Math.min(code.length, end + 2));
  if (afterStr === "['" || afterStr === '["') {
    const classStart = end + 2;
    let classEnd = classStart;
    while (classEnd < code.length && /[a-zA-Z0-9_\-]/.test(code[classEnd])) {
      classEnd++;
    }
    const className = code.slice(classStart, classEnd);
    if (className) {
      return { className, identifier: word };
    }
  }

  return null;
}

/**
 * Resolves absolute path from relative path.
 */
export function resolveRelativePath(basePath, relativePath) {
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
    const baseName = filePath.substring(filePath.lastIndexOf('/') + 1).replace('.module.css', '');

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
  }

  return null;
}

/**
 * Finds the index, line, and column of a className definition in CSS code.
 */
export function findClassInCss(cssCode, className) {
  if (!cssCode || !className) return null;
  const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\.${escapedClassName}\\b`);
  const match = cssCode.match(regex);
  if (match) {
    const index = match.index;
    const before = cssCode.substring(0, index);
    const lines = before.split('\n');
    return {
      line: lines.length,
      col: index - before.lastIndexOf('\n'),
      index,
    };
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
 * Finds the index, line, and column of the first reference to styles.className in JS code.
 */
export function findClassReferenceInJs(jsCode, className, jsFilePath = null, cssFilePath = null) {
  if (!jsCode || !className) return null;
  const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Step 1: Try to find a specific identifier if paths are provided
  let specificIdentifier = null;
  if (jsFilePath && cssFilePath) {
    specificIdentifier = getIdentifierForCssFile(jsCode, jsFilePath, cssFilePath);
  }

  const identifiersToTry = [];
  if (specificIdentifier) {
    identifiersToTry.push(specificIdentifier);
  } else {
    // If no specific identifier, collect all CSS module import identifiers in this JS file
    const imports = getCssImports(jsCode);
    for (const imp of imports) {
      if (imp.identifier) {
        identifiersToTry.push(imp.identifier);
      }
    }
    // Fall back to default 'styles' if no imports have identifiers or to cover backward compatibility
    if (!identifiersToTry.includes('styles')) {
      identifiersToTry.push('styles');
    }
  }

  for (const identifier of identifiersToTry) {
    const escapedIdentifier = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`\\b${escapedIdentifier}\\.${escapedClassName}\\b`),
      new RegExp(`\\b${escapedIdentifier}\\[['"]${escapedClassName}['"]\\]`),
    ];

    for (const regex of patterns) {
      const match = jsCode.match(regex);
      if (match) {
        const index = match.index;
        const before = jsCode.substring(0, index);
        const lines = before.split('\n');
        return {
          line: lines.length,
          col: index - before.lastIndexOf('\n'),
          index,
        };
      }
    }
  }

  return null;
}

/**
 * Finds all JS/JSX files referencing a specific class defined in a CSS module.
 * Returns an array of { filePath, fileName, loc } objects.
 */
export function findReferencingJsFiles(cssFilePath, className, allFileContents) {
  const results = [];
  if (!cssFilePath || !className || !allFileContents) return results;

  for (const [filePath, content] of Object.entries(allFileContents)) {
    if (
      filePath.endsWith('.js') ||
      filePath.endsWith('.jsx') ||
      filePath.endsWith('.ts') ||
      filePath.endsWith('.tsx')
    ) {
      const imports = getCssImports(content);
      const matchedImport = imports.find((imp) => {
        const resolved = resolveRelativePath(filePath, imp.importPath);
        return resolved === cssFilePath;
      });

      if (matchedImport) {
        const loc = findClassReferenceInJs(content, className, filePath, cssFilePath);
        if (loc) {
          results.push({
            filePath,
            fileName: filePath.substring(filePath.lastIndexOf('/') + 1),
            loc,
          });
        }
      }
    }
  }
  return results;
}

/**
 * Finds all CSS files that define a specific class referenced in a JS file.
 * Returns an array of { filePath, fileName, loc } objects.
 */
export function findDefiningCssFiles(jsFilePath, className, identifier, allFileContents) {
  const results = [];
  if (!jsFilePath || !className || !allFileContents) return results;

  const jsContent = allFileContents[jsFilePath];
  if (!jsContent) return results;

  const imports = getCssImports(jsContent);
  const targetImports = identifier
    ? imports.filter((imp) => imp.identifier === identifier)
    : imports;

  for (const imp of targetImports) {
    const resolvedPath = resolveRelativePath(jsFilePath, imp.importPath);
    const cssContent = allFileContents[resolvedPath];
    if (cssContent !== undefined) {
      const loc = findClassInCss(cssContent, className);
      if (loc) {
        results.push({
          filePath: resolvedPath,
          fileName: resolvedPath.substring(resolvedPath.lastIndexOf('/') + 1),
          loc,
        });
      }
    }
  }
  return results;
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
 * Finds all navigation targets in the code (imports and style references)
 * that have valid resolved destinations.
 */
export function findNavigationTargets(code, isCss, fileContents, filePath) {
  const targets = [];
  if (!code) return targets;

  // 1. Imports
  const importRanges = getImportRanges(code, isCss);
  for (const range of importRanges) {
    const resolvedPath = resolveImportPath(filePath, range.path, fileContents);
    if (resolvedPath) {
      targets.push({
        type: 'import',
        name: range.path,
        resolvedPath,
        start: range.start,
        end: range.end,
        targets: [
          {
            filePath: resolvedPath,
            fileName: resolvedPath.substring(resolvedPath.lastIndexOf('/') + 1),
            loc: { line: 1, col: 1, index: 0 },
          },
        ],
      });
    }
  }

  // 2. Styles
  if (isCss) {
    // In CSS: find all selector definitions (e.g. .title)
    const selectorRegex = /\.([a-zA-Z0-9_\-]+)\b/g;
    let match;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex execution loop
    while ((match = selectorRegex.exec(code)) !== null) {
      const className = match[1];
      const start = match.index;
      const end = start + match[0].length;

      // Filter: only classes that actually have referencing JS files
      const referencing = findReferencingJsFiles(filePath, className, fileContents || {});
      if (referencing.length > 0) {
        // Avoid duplicate selector entries
        if (
          !targets.some((t) => t.type === 'style' && t.className === className && t.start === start)
        ) {
          targets.push({
            type: 'style',
            className,
            start,
            end,
            targets: referencing,
          });
        }
      }
    }
  } else {
    // In JS: find all references `identifier.className` or `identifier['className']`
    const cssImports = getCssImports(code);
    if (cssImports.length > 0) {
      for (const imp of cssImports) {
        if (!imp.identifier) continue;

        const resolvedPath = resolveRelativePath(filePath, imp.importPath);
        const cssContent = fileContents?.[resolvedPath];
        if (cssContent === undefined) continue;

        const escapedId = imp.identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Pattern 1: identifier.className
        const dotRegex = new RegExp(`\\b${escapedId}\\.([a-zA-Z0-9_\\-]+)\\b`, 'g');
        let match;
        // biome-ignore lint/suspicious/noAssignInExpressions: standard regex execution loop
        while ((match = dotRegex.exec(code)) !== null) {
          const className = match[1];
          const start = match.index;
          const end = start + match[0].length;

          const loc = findClassInCss(cssContent, className);
          if (loc) {
            targets.push({
              type: 'style',
              className,
              start,
              end,
              resolvedPath,
              targets: [
                {
                  filePath: resolvedPath,
                  fileName: resolvedPath.substring(resolvedPath.lastIndexOf('/') + 1),
                  loc,
                },
              ],
            });
          }
        }

        // Pattern 2: identifier['className']
        const bracketRegex = new RegExp(`\\b${escapedId}\\[['"]([a-zA-Z0-9_\\-]+)['"]\\]`, 'g');
        // biome-ignore lint/suspicious/noAssignInExpressions: standard regex execution loop
        while ((match = bracketRegex.exec(code)) !== null) {
          const className = match[1];
          const start = match.index;
          const end = start + match[0].length;

          const loc = findClassInCss(cssContent, className);
          if (loc) {
            targets.push({
              type: 'style',
              className,
              start,
              end,
              resolvedPath,
              targets: [
                {
                  filePath: resolvedPath,
                  fileName: resolvedPath.substring(resolvedPath.lastIndexOf('/') + 1),
                  loc,
                },
              ],
            });
          }
        }
      }
    }
  }

  return targets;
}
