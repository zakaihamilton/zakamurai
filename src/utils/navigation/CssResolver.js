import { getCssImports, resolveRelativePath } from './ImportResolver';

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
