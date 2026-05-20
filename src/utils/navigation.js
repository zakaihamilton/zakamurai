import {
  findImportSource,
  getAssociatedFilePath,
  getCssImports,
  getIdentifierForCssFile,
  getImportRanges,
  resolveImportPath,
  resolveRelativePath,
} from './navigation/ImportResolver';

import { findClassInCss, findDefiningCssFiles } from './navigation/CssResolver';

import {
  findClassReferenceInJs,
  findComponentDefinition,
  findReferencingExportJsFiles,
  findReferencingJsFiles,
  getExportRanges,
  getLocFromIndex,
} from './navigation/JsSymbolResolver';

// Re-export all submodules functions to keep the API exactly the same
export {
  getCssImports,
  resolveRelativePath,
  getAssociatedFilePath,
  getIdentifierForCssFile,
  findClassInCss,
  findClassReferenceInJs,
  findReferencingJsFiles,
  findDefiningCssFiles,
  resolveImportPath,
  getImportRanges,
  findImportSource,
  findComponentDefinition,
  getLocFromIndex,
  findReferencingExportJsFiles,
  getExportRanges,
};

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
  // 3. Exports in JS/TS files
  if (!isCss) {
    const exportRanges = getExportRanges(code);
    for (const range of exportRanges) {
      const referencing = findReferencingExportJsFiles(
        filePath,
        range.name,
        range.isDefault,
        fileContents || {},
      );
      if (referencing.length > 0) {
        targets.push({
          type: 'export',
          name: range.name,
          start: range.start,
          end: range.end,
          targets: referencing,
        });
      }
    }
  }

  // 4. Components in JSX tags
  if (!isCss) {
    const jsxTagRegex = /(?:<|<\/)([A-Z][a-zA-Z0-9_$]*)\b/g;
    let match;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex matching loop
    while ((match = jsxTagRegex.exec(code)) !== null) {
      const componentName = match[1];
      const start = match.index + match[0].indexOf(componentName);
      const end = start + componentName.length;

      // Avoid duplicates
      if (!targets.some((t) => t.start === start && t.end === end)) {
        const def = findComponentDefinition(filePath, componentName, fileContents || {});
        if (def) {
          targets.push({
            type: 'component',
            name: componentName,
            start,
            end,
            targets: [def],
          });
        }
      }
    }
  }

  return targets;
}
