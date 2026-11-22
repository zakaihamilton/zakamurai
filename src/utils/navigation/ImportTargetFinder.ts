import { getImportRanges, resolveImportPath } from './ImportResolver';
import {
  findComponentDefinition,
  findReferencingExportJsFiles,
  getExportRanges,
  getLocFromIndex,
} from './JsSymbolResolver';
import type { FileContents, NavigationTarget, SourceLocation } from './types';

function findSymbolLocation(
  targetContent: string,
  symbolName: string,
  isDefault = false,
): SourceLocation {
  if (!targetContent) return { line: 1, col: 1, index: 0 };

  const exportRanges = getExportRanges(targetContent);
  if (isDefault) {
    const defExport = exportRanges.find((r) => r.isDefault);
    if (defExport) return getLocFromIndex(targetContent, defExport.start);
  } else {
    const namedExport = exportRanges.find((r) => !r.isDefault && r.name === symbolName);
    if (namedExport) return getLocFromIndex(targetContent, namedExport.start);
  }

  const localDefRegex = new RegExp(`\\b(const|let|var|function|class)\\s+${symbolName}\\b`);
  const match = targetContent.match(localDefRegex);
  if (match && match.index !== undefined) {
    return getLocFromIndex(targetContent, match.index);
  }

  return { line: 1, col: 1, index: 0 };
}

function addSymbolOccurrences({
  targets,
  importClause,
  startOfImport,
  clauseIndex,
  symbol,
  resolvedPath,
  loc,
}: {
  targets: NavigationTarget[];
  importClause: string;
  startOfImport: number;
  clauseIndex: number;
  symbol: string;
  resolvedPath: string;
  loc: SourceLocation;
}) {
  const symRegex = new RegExp(`\\b${symbol}\\b`, 'g');
  let symMatch: RegExpExecArray | null = null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex matching loop
  while ((symMatch = symRegex.exec(importClause)) !== null) {
    const start = startOfImport + clauseIndex + symMatch.index;
    targets.push({
      type: 'import',
      name: symbol,
      resolvedPath,
      start,
      end: start + symbol.length,
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

export function findImportNavigationTargets(
  code: string,
  isCss: boolean,
  fileContents: FileContents,
  filePath: string,
): NavigationTarget[] {
  const targets: NavigationTarget[] = [];

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

  if (isCss) return targets;

  const esmImportRegex = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null = null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex matching loop
  while ((match = esmImportRegex.exec(code)) !== null) {
    const importClause = match[1].trim();
    const importPath = match[2];
    const startOfImport = match.index;
    const resolvedPath = resolveImportPath(filePath, importPath, fileContents);
    if (!resolvedPath) continue;

    const targetContent = fileContents[resolvedPath];
    const clauseIndex = match[0].indexOf(importClause);
    if (clauseIndex === -1) continue;

    let defaultImport: string | null = null;
    const commaIdx = importClause.indexOf(',');
    if (commaIdx !== -1) {
      defaultImport = importClause.substring(0, commaIdx).trim();
    } else if (!importClause.includes('{') && !importClause.includes('* as')) {
      defaultImport = importClause.trim();
    }
    if (defaultImport) {
      addSymbolOccurrences({
        targets,
        importClause,
        startOfImport,
        clauseIndex,
        symbol: defaultImport,
        resolvedPath,
        loc: findSymbolLocation(targetContent, defaultImport, true),
      });
    }

    const namespaceMatch = importClause.match(/\*\s+as\s+(\w+)/);
    if (namespaceMatch) {
      addSymbolOccurrences({
        targets,
        importClause,
        startOfImport,
        clauseIndex,
        symbol: namespaceMatch[1],
        resolvedPath,
        loc: { line: 1, col: 1, index: 0 },
      });
    }

    const bracesMatch = importClause.match(/\{([\s\S]*?)\}/);
    if (bracesMatch) {
      for (const rawItem of bracesMatch[1].split(',')) {
        const item = rawItem.trim();
        if (!item) continue;

        let orig = item;
        let alias: string | null = null;
        if (item.includes(' as ')) {
          const parts = item.split(/\s+as\s+/);
          orig = parts[0].trim();
          alias = parts[1].trim();
        }

        const loc = findSymbolLocation(targetContent, orig, false);
        for (const sym of alias ? [orig, alias] : [orig]) {
          addSymbolOccurrences({
            targets,
            importClause,
            startOfImport,
            clauseIndex,
            symbol: sym,
            resolvedPath,
            loc,
          });
        }
      }
    }
  }

  return targets;
}

export function findExportAndComponentTargets(
  code: string,
  fileContents: FileContents,
  filePath: string,
  existingTargets: NavigationTarget[],
): NavigationTarget[] {
  const targets: NavigationTarget[] = [];

  for (const range of getExportRanges(code)) {
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

  const jsxTagRegex = /(?:<|<\/)([A-Z][a-zA-Z0-9_$]*)\b/g;
  let match: RegExpExecArray | null = null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex matching loop
  while ((match = jsxTagRegex.exec(code)) !== null) {
    const componentName = match[1];
    const start = match.index + match[0].indexOf(componentName);
    const end = start + componentName.length;
    if (
      existingTargets.some((t) => t.start === start && t.end === end) ||
      targets.some((t) => t.start === start && t.end === end)
    ) {
      continue;
    }
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

  return targets;
}
