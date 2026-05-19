export function getVisibleFoldedContent(code = '', folds = [], collapsedFoldIds = []) {
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

  const hiddenLines = new Set();
  const placeholderByLine = new Map();

  for (const fold of collapsedFolds) {
    for (let line = fold.startLine + 1; line <= fold.endLine; line++) {
      hiddenLines.add(line);
    }

    const closingLine = lines[fold.endLine - 1] || '';
    const trailingText = closingLine.slice(closingLine.lastIndexOf('}') + 1).trimEnd();
    placeholderByLine.set(fold.startLine, ` ... }${trailingText}`);
  }

  const visibleLines = [];
  const lineItems = [];

  lines.forEach((lineText, index) => {
    const line = index + 1;
    if (hiddenLines.has(line)) return;

    visibleLines.push(`${lineText}${placeholderByLine.get(line) || ''}`);
    lineItems.push({ line });
  });

  return {
    content: visibleLines.join('\n'),
    lineItems,
    hasCollapsedFolds: true,
  };
}

export function getFoldStarts(folds = []) {
  return Object.fromEntries(folds.map((fold) => [fold.startLine, fold]));
}
