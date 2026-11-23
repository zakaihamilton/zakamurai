import { findClassInCss } from './CssResolver';
import { getCssImports, resolveRelativePath } from './ImportResolver';
import { findReferencingJsFiles } from './JsSymbolResolver';
import type { FileContents, NavigationTarget, SourceLocation, StyleAtCursor } from './types';

function extractWordAt(code: string, index: number): { word: string; start: number; end: number } {
  let start = index;
  let end = index;
  while (start > 0 && /[a-zA-Z0-9_\-]/.test(code[start - 1])) {
    start--;
  }
  while (end < code.length && /[a-zA-Z0-9_\-]/.test(code[end])) {
    end++;
  }
  return { word: code.slice(start, end), start, end };
}

function readIdentifierBefore(code: string, endIdx: number): string {
  let idStart = endIdx;
  while (idStart > 0 && /[a-zA-Z0-9_]/.test(code[idStart - 1])) {
    idStart--;
  }
  return code.slice(idStart, endIdx);
}

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
    let wordIndex = index;
    if (
      code[wordIndex] === '.' &&
      wordIndex < code.length - 1 &&
      /[a-zA-Z0-9_\-]/.test(code[wordIndex + 1])
    ) {
      wordIndex++;
    }

    const { word, start } = extractWordAt(code, wordIndex);
    if (!word) return null;

    if (start > 0 && code[start - 1] === '.') {
      return { className: word, identifier: null };
    }

    if (/^[a-zA-Z0-9_\-]+$/.test(word) && new RegExp(`\\.${word}\\b`).test(code)) {
      return { className: word, identifier: null };
    }
    return null;
  }

  const { word, start, end } = extractWordAt(code, index);
  if (!word || !/^[a-zA-Z0-9_\-]+$/.test(word)) return null;

  // Case 1: Dot notation - Cursor is on the className (e.g., word = "title" in "styles.title")
  if (start > 0 && code[start - 1] === '.') {
    const identifier = readIdentifierBefore(code, start - 1);
    if (identifier) return { className: word, identifier };
  }

  // Case 2: Bracket notation - Cursor is on the className (e.g., word = "title" in "styles['title']")
  const beforeStr = code.slice(Math.max(0, start - 2), start);
  if (beforeStr === "['" || beforeStr === '["') {
    const identifier = readIdentifierBefore(code, start - 2);
    if (identifier) return { className: word, identifier };
  }

  // Case 3: Cursor is on the identifier in dot notation (e.g., word = "styles" in "styles.title")
  if (end < code.length && code[end] === '.') {
    let classEnd = end + 1;
    while (classEnd < code.length && /[a-zA-Z0-9_\-]/.test(code[classEnd])) {
      classEnd++;
    }
    const className = code.slice(end + 1, classEnd);
    if (className) return { className, identifier: word };
  }

  // Case 4: Cursor is on the identifier in bracket notation (e.g., word = "styles" in "styles['title']")
  const afterStr = code.slice(end, Math.min(code.length, end + 2));
  if (afterStr === "['" || afterStr === '["') {
    let classEnd = end + 2;
    while (classEnd < code.length && /[a-zA-Z0-9_\-]/.test(code[classEnd])) {
      classEnd++;
    }
    const className = code.slice(end + 2, classEnd);
    if (className) return { className, identifier: word };
  }

  return null;
}

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

function collectCssTargets(
  code: string,
  fileContents: FileContents,
  filePath: string,
): NavigationTarget[] {
  const targets: NavigationTarget[] = [];

  // Selector definitions (e.g. .title)
  const selectorRegex = /\.([a-zA-Z0-9_\-]+)\b/g;
  let match: RegExpExecArray | null = null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex execution loop
  while ((match = selectorRegex.exec(code)) !== null) {
    const className = match[1];
    const start = match.index;
    const end = start + match[0].length;
    const referencing = findReferencingJsFiles(filePath, className, fileContents || {});
    if (
      referencing.length > 0 &&
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

  // CSS Keyframe definitions & usages
  const definedKeyframes = new Map<string, SourceLocation>();
  const keyframeDefRegex = /@keyframes\s+([a-zA-Z0-9_\-]+)\b/g;
  let defMatch: RegExpExecArray | null = null;
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

  const animRegex = /\b(animation|animation-name)\s*:\s*([^;]+);/g;
  let useMatch: RegExpExecArray | null = null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex matching loop
  while ((useMatch = animRegex.exec(code)) !== null) {
    const value = useMatch[2];
    const valIndex = useMatch.index + useMatch[0].indexOf(value);

    for (const [keyframeName, loc] of definedKeyframes.entries()) {
      const keyframeRegex = new RegExp(`\\b${keyframeName}\\b`, 'g');
      let keyframeMatch: RegExpExecArray | null = null;
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

  return targets;
}

function pushMatchedClassTarget(
  targets: NavigationTarget[],
  cssContent: string,
  resolvedPath: string,
  className: string,
  start: number,
  end: number,
): void {
  const loc = findClassInCss(cssContent, className);
  if (!loc) return;
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

function collectJsStyleTargets(
  code: string,
  fileContents: FileContents,
  filePath: string,
): NavigationTarget[] {
  const targets: NavigationTarget[] = [];
  const cssImports = getCssImports(code);
  if (cssImports.length === 0) return targets;

  for (const imp of cssImports) {
    const resolvedPath = resolveRelativePath(filePath, imp.importPath);
    const cssContent = fileContents?.[resolvedPath];
    if (cssContent === undefined) continue;

    if (!imp.identifier) {
      const selectorRegex = /\.([a-zA-Z0-9_\-]+)\b/g;
      let selMatch: RegExpExecArray | null = null;
      const classesInCss = new Set<string>();
      // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
      while ((selMatch = selectorRegex.exec(cssContent)) !== null) {
        classesInCss.add(selMatch[1]);
      }

      for (const className of classesInCss) {
        const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const stringLiteralRegex = new RegExp(
          `['"\\\`][^'"\\\`]*?(?<![a-zA-Z0-9_\\\\-])${escapedClassName}(?![a-zA-Z0-9_\\\\-])`,
          'g',
        );
        let classMatch: RegExpExecArray | null = null;
        // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
        while ((classMatch = stringLiteralRegex.exec(code)) !== null) {
          const fullMatchText = classMatch[0];
          const classIdxInMatch = fullMatchText.search(
            new RegExp(`(?<![a-zA-Z0-9_\\\\-])${escapedClassName}(?![a-zA-Z0-9_\\\\-])`),
          );
          const start = classMatch.index + (classIdxInMatch !== -1 ? classIdxInMatch : 0);
          pushMatchedClassTarget(
            targets,
            cssContent,
            resolvedPath,
            className,
            start,
            start + className.length,
          );
        }
      }
      continue;
    }

    const escapedId = imp.identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`\\b${escapedId}\\.([a-zA-Z0-9_\\-]+)\\b`, 'g'),
      new RegExp(`\\b${escapedId}\\[['"]([a-zA-Z0-9_\\-]+)['"]\\]`, 'g'),
    ];
    for (const regex of patterns) {
      let match: RegExpExecArray | null = null;
      // biome-ignore lint/suspicious/noAssignInExpressions: standard regex execution loop
      while ((match = regex.exec(code)) !== null) {
        pushMatchedClassTarget(
          targets,
          cssContent,
          resolvedPath,
          match[1],
          match.index,
          match.index + match[0].length,
        );
      }
    }
  }

  return targets;
}

export function findStyleNavigationTargets(
  code: string,
  isCss: boolean,
  fileContents: FileContents,
  filePath: string,
): NavigationTarget[] {
  return isCss
    ? collectCssTargets(code, fileContents, filePath)
    : collectJsStyleTargets(code, fileContents, filePath);
}
