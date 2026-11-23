import { findClassInCss, findDefiningCssFiles } from './navigation/CssResolver';
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
import {
  findExportAndComponentTargets,
  findImportNavigationTargets,
} from './navigation/ImportTargetFinder';
import {
  findClassReferenceInJs,
  findComponentDefinition,
  findReferencingExportJsFiles,
  findReferencingJsFiles,
  getExportRanges,
  getLocFromIndex,
} from './navigation/JsSymbolResolver';
import { findStyleNavigationTargets, getStyleAtCursor } from './navigation/StyleNavigation';
import { resolveVariables } from './navigation/VariableResolver';
import type { FileContents, NavigationTarget } from './navigation/types';

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
  getStyleAtCursor,
};

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

  targets.push(...findImportNavigationTargets(code, isCss, fileContents, filePath));
  targets.push(...findStyleNavigationTargets(code, isCss, fileContents, filePath));

  if (!isCss) {
    targets.push(...findExportAndComponentTargets(code, fileContents, filePath, targets));

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
