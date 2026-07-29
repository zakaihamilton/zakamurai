import type { CodeFold, EditorLineItem } from './types';

export function getVisibleFoldedContent(
  code = '',
  folds: CodeFold[] = [],
  collapsedFoldIds: string[] = [],
) {
  const collapsedIds = new Set(collapsedFoldIds);
  const collapsedFolds = folds.filter((fold) => collapsedIds.has(fold.id));
  const lines = code.split('\n');

  if (collapsedFolds.length === 0) {
    return {
      content: code,
      lineItems: lines.map((_, index) => ({ line: index + 1 })),
      hasCollapsedFolds: false,
    };
  }

  const hiddenLines = new Set<number>();
  const placeholderByLine = new Map<number, string>();
  const foldByStartLine = new Map<number, CodeFold & { placeholder: string }>();

  for (const fold of collapsedFolds) {
    for (let line = fold.startLine + 1; line <= fold.endLine; line++) {
      hiddenLines.add(line);
    }

    let placeholder = '';
    if (fold.placeholder) {
      placeholder = fold.placeholder;
    } else {
      const closingLine = lines[fold.endLine - 1] || '';
      const trailingText = closingLine.slice(closingLine.lastIndexOf('}') + 1).trimEnd();
      placeholder = ` ... }${trailingText}`;
    }
    placeholderByLine.set(fold.startLine, placeholder);
    foldByStartLine.set(fold.startLine, { ...fold, placeholder });
  }

  const visibleLines: string[] = [];
  const lineItems: EditorLineItem[] = [];

  lines.forEach((lineText, index) => {
    const line = index + 1;
    if (hiddenLines.has(line)) return;

    const placeholder = placeholderByLine.get(line) || '';
    visibleLines.push(`${lineText}${placeholder}`);
    lineItems.push({
      line,
      originalText: lineText,
      placeholder,
      fold: foldByStartLine.get(line),
    });
  });

  return {
    content: visibleLines.join('\n'),
    lineItems,
    hasCollapsedFolds: true,
  };
}

export function getFoldStarts(folds: CodeFold[] = []) {
  return Object.fromEntries(folds.map((fold) => [fold.startLine, fold]));
}

export function applyFoldedContentEdit(
  originalCode = '',
  projectedCode = '',
  lineItems: EditorLineItem[] = [],
): string {
  const originalLines = originalCode.split('\n');
  const projectedLines = projectedCode.split('\n');

  lineItems.forEach((item, index) => {
    const projectedLine = projectedLines[index];
    if (projectedLine === undefined) return;

    let nextLine = projectedLine;
    if (item.placeholder && nextLine.endsWith(item.placeholder)) {
      nextLine = nextLine.slice(0, -item.placeholder.length);
    }

    originalLines[item.line - 1] = nextLine;
  });

  return originalLines.join('\n');
}

export function getExpandedFoldedSelection(
  originalCode: string,
  projectedCode: string,
  lineItems: EditorLineItem[],
  start: number,
  end: number,
): string {
  if (start === end) return '';

  const projectedStart = getLineColumnAtIndex(projectedCode, start);
  const projectedEnd = getLineColumnAtIndex(projectedCode, end);
  const startItem = lineItems[projectedStart.line - 1];
  const endItem = lineItems[projectedEnd.line - 1];
  if (!startItem || !endItem) return projectedCode.slice(start, end);

  const originalLines = originalCode.split('\n');
  const originalStart = getOriginalIndexForProjectedPosition(
    originalLines,
    startItem,
    projectedStart.column,
  );
  const originalEnd = getOriginalIndexForProjectedPosition(
    originalLines,
    endItem,
    projectedEnd.column,
  );

  return originalCode.slice(originalStart, originalEnd);
}

function getLineColumnAtIndex(value: string, index: number) {
  let line = 1;
  let lineStart = 0;

  for (let cursor = 0; cursor < index; cursor++) {
    if (value.charCodeAt(cursor) === 10) {
      line++;
      lineStart = cursor + 1;
    }
  }

  return { line, column: index - lineStart };
}

function getOriginalIndexForProjectedPosition(
  originalLines: string[],
  lineItem: EditorLineItem,
  column: number,
): number {
  const lineIndex = lineItem.line - 1;
  const originalLine = originalLines[lineIndex] || '';
  const baseIndex = originalLines
    .slice(0, lineIndex)
    .reduce((total, line) => total + line.length + 1, 0);

  if (!lineItem.fold || column <= originalLine.length) {
    return baseIndex + Math.min(column, originalLine.length);
  }

  const closingLineIndex = lineItem.fold.endLine - 1;
  const closingLine = originalLines[closingLineIndex] || '';
  const closingLineStart = originalLines
    .slice(0, closingLineIndex)
    .reduce((total, line) => total + line.length + 1, 0);

  return closingLineStart + closingLine.length;
}
