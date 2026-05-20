import {
  findImportSource,
  getCssImports,
  getImportRanges,
  resolveImportPath,
  resolveRelativePath,
} from './ImportResolver';

import { findClassInCss } from './CssResolver';

/**
 * Helper to get line, column, and index from a character index.
 */
export function getLocFromIndex(code, index) {
  if (!code || index === undefined || index < 0) return { line: 1, col: 1, index: 0 };
  const before = code.substring(0, index);
  const lines = before.split('\n');
  return {
    line: lines.length,
    col: index - before.lastIndexOf('\n'),
    index,
  };
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
 * Extracts ranges (start and end indexes) of export statements in JS/TS code.
 */
export function getExportRanges(code) {
  const ranges = [];
  if (!code) return ranges;

  // Named exports: export const name, export function name, export class name
  const namedExportRegex = /\bexport\s+(?:const|let|var|function|class)\s+([a-zA-Z0-9_$]+)\b/g;
  let match;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
  while ((match = namedExportRegex.exec(code)) !== null) {
    const name = match[1];
    const start = match.index;
    const end = start + match[0].length;
    ranges.push({
      type: 'export',
      name,
      isDefault: false,
      start,
      end,
    });
  }

  // Default exports: export default name or export default function name
  const defaultExportRegex =
    /\bexport\s+default\s+(?:function\s+|class\s+|const\s+|let\s+|var\s+)?([a-zA-Z0-9_$]+)\b/g;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
  while ((match = defaultExportRegex.exec(code)) !== null) {
    const name = match[1];
    const start = match.index;
    const end = start + match[0].length;
    ranges.push({
      type: 'export',
      name,
      isDefault: true,
      start,
      end,
    });
  }

  return ranges;
}

/**
 * Finds all JS/TS files referencing a specific export from a JS file.
 * Returns an array of { filePath, fileName, loc } objects.
 */
export function findReferencingExportJsFiles(
  exportedFilePath,
  exportName,
  isDefault,
  allFileContents,
) {
  const results = [];
  if (!exportedFilePath || !allFileContents) return results;

  for (const [filePath, content] of Object.entries(allFileContents)) {
    if (filePath === exportedFilePath) continue;
    if (
      !filePath.endsWith('.js') &&
      !filePath.endsWith('.jsx') &&
      !filePath.endsWith('.ts') &&
      !filePath.endsWith('.tsx')
    ) {
      continue;
    }

    const importRanges = getImportRanges(content, false);
    for (const range of importRanges) {
      const resolved = resolveImportPath(filePath, range.path, allFileContents);
      if (resolved === exportedFilePath) {
        // If it's a named export, verify that the symbol is imported or referenced in the file
        if (!isDefault && !content.includes(exportName)) {
          continue;
        }

        const before = content.substring(0, range.start);
        const lines = before.split('\n');
        results.push({
          filePath,
          fileName: filePath.substring(filePath.lastIndexOf('/') + 1),
          loc: {
            line: lines.length,
            col: range.start - before.lastIndexOf('\n'),
            index: range.start,
          },
        });
        break;
      }
    }
  }
  return results;
}

/**
 * Resolves the location of a component's definition.
 */
export function findComponentDefinition(filePath, componentName, allFileContents) {
  if (!filePath || !componentName || !allFileContents) return null;

  const currentContent = allFileContents[filePath];
  if (!currentContent) return null;

  // 1. Check if the component is imported from another file
  const importSource = findImportSource(currentContent, componentName);
  if (importSource) {
    const resolvedPath = resolveImportPath(filePath, importSource.importPath, allFileContents);
    if (resolvedPath) {
      const targetContent = allFileContents[resolvedPath];
      if (targetContent) {
        const targetFileName = resolvedPath.substring(resolvedPath.lastIndexOf('/') + 1);

        const exportRanges = getExportRanges(targetContent);
        let targetLoc = null;

        if (importSource.isDefault) {
          const defExport = exportRanges.find((r) => r.isDefault);
          if (defExport) {
            targetLoc = getLocFromIndex(targetContent, defExport.start);
          }
        } else if (importSource.originalName) {
          const namedExport = exportRanges.find(
            (r) => !r.isDefault && r.name === importSource.originalName,
          );
          if (namedExport) {
            targetLoc = getLocFromIndex(targetContent, namedExport.start);
          }
        }

        if (!targetLoc) {
          const localDefRegex = new RegExp(
            `\\b(const|let|var|function|class)\\s+${componentName}\\b`,
          );
          const match = targetContent.match(localDefRegex);
          if (match) {
            targetLoc = getLocFromIndex(targetContent, match.index);
          }
        }

        if (!targetLoc) {
          targetLoc = { line: 1, col: 1, index: 0 };
        }

        return {
          filePath: resolvedPath,
          fileName: targetFileName,
          loc: targetLoc,
        };
      }
    }
  }

  // 2. Check if defined locally
  const localDefRegex = new RegExp(`\\b(const|let|var|function|class)\\s+${componentName}\\b`);
  const match = currentContent.match(localDefRegex);
  if (match) {
    const targetLoc = getLocFromIndex(currentContent, match.index);
    return {
      filePath,
      fileName: filePath.substring(filePath.lastIndexOf('/') + 1),
      loc: targetLoc,
    };
  }

  return null;
}
