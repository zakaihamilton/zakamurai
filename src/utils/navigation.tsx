import {
  findImportSource,
  getAssociatedFilePath,
  getCssImports,
  getIdentifierForCssFile,
  getImportPathCandidates,
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

import { resolveVariables } from './navigation/VariableResolver';
import type { FileContents, NavigationTarget, SourceLocation, StyleAtCursor } from './navigation/types';

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
  getImportPathCandidates,
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
export function getStyleAtCursor(
  code: string,
  index: number | undefined,
  isCss: boolean,
): StyleAtCursor | null {
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
 * Helper to find the location of a symbol's definition in the target file content.
 */
function findSymbolLocation(
  targetContent: string,
  symbolName: string,
  isDefault = false,
): SourceLocation {
  if (!targetContent) return { line: 1, col: 1, index: 0 };

  const exportRanges = getExportRanges(targetContent);

  if (isDefault) {
    const defExport = exportRanges.find((r) => r.isDefault);
    if (defExport) {
      return getLocFromIndex(targetContent, defExport.start);
    }
  } else {
    const namedExport = exportRanges.find((r) => !r.isDefault && r.name === symbolName);
    if (namedExport) {
      return getLocFromIndex(targetContent, namedExport.start);
    }
  }

  // Fallback to local definition regex
  const localDefRegex = new RegExp(`\\b(const|let|var|function|class)\\s+${symbolName}\\b`);
  const match = targetContent.match(localDefRegex);
  if (match && match.index !== undefined) {
    return getLocFromIndex(targetContent, match.index);
  }

  return { line: 1, col: 1, index: 0 };
}

/**
 * Helper to find all references to a keyframe in CSS code.
 */
function findKeyframeReferences(
  cssCode: string,
  keyframeName: string,
  filePath: string,
): Array<{ filePath: string; fileName: string; loc: SourceLocation }> {
  const refs: Array<{ filePath: string; fileName: string; loc: SourceLocation }> = [];
  if (!cssCode || !keyframeName) return refs;
  const animRegex = /\b(animation|animation-name)\s*:\s*([^;]+);/g;
  let match = animRegex.exec(cssCode);
  while (match !== null) {
    const value = match[2];
    const valIndex = match.index + match[0].indexOf(value);

    const keyframeRegex = new RegExp(`\\b${keyframeName}\\b`, 'g');
    let keyframeMatch = keyframeRegex.exec(value);
    while (keyframeMatch !== null) {
      const refIndex = valIndex + keyframeMatch.index;
      const before = cssCode.substring(0, refIndex);
      const lines = before.split('\n');
      refs.push({
        filePath,
        fileName: filePath.substring(filePath.lastIndexOf('/') + 1),
        loc: {
          line: lines.length,
          col: refIndex - before.lastIndexOf('\n'),
          index: refIndex,
        },
      });
      keyframeMatch = keyframeRegex.exec(value);
    }
    match = animRegex.exec(cssCode);
  }
  return refs;
}

/**
 * Finds all navigation targets in the code (imports and style references)
 * that have valid resolved destinations.
 */
export function findNavigationTargets(
  code: string,
  isCss: boolean,
  fileContents: FileContents,
  filePath: string,
): NavigationTarget[] {
  const targets: NavigationTarget[] = [];
  if (!code) return targets;

  // 1. Imports and Import Symbols
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

  // Symbol-level click navigation in ES6 imports
  if (!isCss) {
    const esmImportRegex = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex matching loop
    while ((match = esmImportRegex.exec(code)) !== null) {
      const importClause = match[1].trim();
      const importPath = match[2];
      const startOfImport = match.index;
      const importStatementText = match[0];

      const resolvedPath = resolveImportPath(filePath, importPath, fileContents);
      if (resolvedPath) {
        const targetContent = fileContents[resolvedPath];
        const clauseIndex = importStatementText.indexOf(importClause);

        if (clauseIndex !== -1) {
          // Process default import if any
          let defaultImport = null;
          const commaIdx = importClause.indexOf(',');
          if (commaIdx !== -1) {
            defaultImport = importClause.substring(0, commaIdx).trim();
          } else if (!importClause.includes('{') && !importClause.includes('* as')) {
            defaultImport = importClause.trim();
          }

          if (defaultImport) {
            const defaultRegex = new RegExp(`\\b${defaultImport}\\b`, 'g');
            let defMatch;
            // biome-ignore lint/suspicious/noAssignInExpressions: standard regex matching loop
            while ((defMatch = defaultRegex.exec(importClause)) !== null) {
              const start = startOfImport + clauseIndex + defMatch.index;
              const end = start + defaultImport.length;
              const loc = findSymbolLocation(targetContent, defaultImport, true);

              targets.push({
                type: 'import',
                name: defaultImport,
                resolvedPath,
                start,
                end,
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

          // Process namespace import if any
          const namespaceMatch = importClause.match(/\*\s+as\s+(\w+)/);
          if (namespaceMatch) {
            const namespaceName = namespaceMatch[1];
            const nsRegex = new RegExp(`\\b${namespaceName}\\b`, 'g');
            let nsMatch;
            // biome-ignore lint/suspicious/noAssignInExpressions: standard regex matching loop
            while ((nsMatch = nsRegex.exec(importClause)) !== null) {
              const start = startOfImport + clauseIndex + nsMatch.index;
              const end = start + namespaceName.length;

              targets.push({
                type: 'import',
                name: namespaceName,
                resolvedPath,
                start,
                end,
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

          // Process named imports inside `{ ... }`
          const bracesMatch = importClause.match(/\{([\s\S]*?)\}/);
          if (bracesMatch) {
            const namedImports = bracesMatch[1].split(',');
            for (let item of namedImports) {
              item = item.trim();
              if (!item) continue;

              let orig = item;
              let alias = null;

              if (item.includes(' as ')) {
                const parts = item.split(/\s+as\s+/);
                orig = parts[0].trim();
                alias = parts[1].trim();
              }

              // Resolve both the original and the alias names as clickable targets
              const symbolsToResolve = alias ? [orig, alias] : [orig];

              for (const sym of symbolsToResolve) {
                const symRegex = new RegExp(`\\b${sym}\\b`, 'g');
                let symMatch;
                // biome-ignore lint/suspicious/noAssignInExpressions: standard regex matching loop
                while ((symMatch = symRegex.exec(importClause)) !== null) {
                  const start = startOfImport + clauseIndex + symMatch.index;
                  const end = start + sym.length;

                  // For both orig and alias, definition location in target file is the original exported name
                  const loc = findSymbolLocation(targetContent, orig, false);

                  targets.push({
                    type: 'import',
                    name: sym,
                    resolvedPath,
                    start,
                    end,
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
      }
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
            name: className,
            start,
            end,
            targets: referencing,
          });
        }
      }
    }

    // CSS Keyframe definitions & usages
    const definedKeyframes = new Map(); // name -> loc
    const keyframeDefRegex = /@keyframes\s+([a-zA-Z0-9_\-]+)\b/g;
    let defMatch;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex matching loop
    while ((defMatch = keyframeDefRegex.exec(code)) !== null) {
      const name = defMatch[1];
      const idx = defMatch.index + defMatch[0].indexOf(name);
      const before = code.substring(0, idx);
      const lines = before.split('\n');
      definedKeyframes.set(name, {
        line: lines.length,
        col: idx - before.lastIndexOf('\n'),
        index: idx,
      });
    }

    // Add targets for keyframe definitions pointing to their usages/references
    for (const [keyframeName, loc] of definedKeyframes.entries()) {
      const defStart = loc.index;
      const defEnd = defStart + keyframeName.length;
      const references = findKeyframeReferences(code, keyframeName, filePath);
      if (references.length > 0) {
        targets.push({
          type: 'export',
          name: keyframeName,
          start: defStart,
          end: defEnd,
          targets: references,
        });
      }
    }

    // Add targets for animation keyframe usages pointing to the definition
    const animRegex = /\b(animation|animation-name)\s*:\s*([^;]+);/g;
    let useMatch;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex matching loop
    while ((useMatch = animRegex.exec(code)) !== null) {
      const value = useMatch[2];
      const valIndex = useMatch.index + useMatch[0].indexOf(value);

      for (const [keyframeName, loc] of definedKeyframes.entries()) {
        const keyframeRegex = new RegExp(`\\b${keyframeName}\\b`, 'g');
        let keyframeMatch;
        // biome-ignore lint/suspicious/noAssignInExpressions: standard regex matching loop
        while ((keyframeMatch = keyframeRegex.exec(value)) !== null) {
          const start = valIndex + keyframeMatch.index;
          const end = start + keyframeName.length;

          targets.push({
            type: 'import',
            name: keyframeName,
            resolvedPath: filePath,
            start,
            end,
            targets: [
              {
                filePath,
                fileName: filePath.substring(filePath.lastIndexOf('/') + 1),
                loc,
              },
            ],
          });
        }
      }
    }
  } else {
    const cssImports = getCssImports(code);
    if (cssImports.length > 0) {
      for (const imp of cssImports) {
        const resolvedPath = resolveRelativePath(filePath, imp.importPath);
        const cssContent = fileContents?.[resolvedPath];
        if (cssContent === undefined) continue;

        if (!imp.identifier) {
          // Standard CSS import (anonymous)
          // Find all class selector definitions in the CSS content
          const selectorRegex = /\.([a-zA-Z0-9_\-]+)\b/g;
          let selMatch;
          const classesInCss = new Set<string>();
          // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
          while ((selMatch = selectorRegex.exec(cssContent)) !== null) {
            classesInCss.add(selMatch[1] as string);
          }

          for (const className of classesInCss) {
            const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const stringLiteralRegex = new RegExp(
              `['"\\\`][^'"\\\`]*?(?<![a-zA-Z0-9_\\\\-])${escapedClassName}(?![a-zA-Z0-9_\\\\-])`,
              'g',
            );
            let classMatch;
            // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
            while ((classMatch = stringLiteralRegex.exec(code)) !== null) {
              const fullMatchText = classMatch[0];
              const matchIndex = classMatch.index;
              const classIdxInMatch = fullMatchText.search(
                new RegExp(`(?<![a-zA-Z0-9_\\\\-])${escapedClassName}(?![a-zA-Z0-9_\\\\-])`),
              );
              const start = matchIndex + (classIdxInMatch !== -1 ? classIdxInMatch : 0);
              const end = start + className.length;

              const loc = findClassInCss(cssContent, className);
              if (loc) {
                targets.push({
                  type: 'style',
                  className,
                  name: className,
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
          continue;
        }

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
              name: className,
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
              name: className,
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

  // 5. Variables in JS/JSX files
  if (!isCss) {
    const varTargets = resolveVariables(code, filePath);
    for (const vt of varTargets) {
      const isOverlapping = targets.some((t) => vt.start < t.end && t.start < vt.end);
      if (!isOverlapping) {
        targets.push(vt);
      }
    }
  }

  return targets;
}
