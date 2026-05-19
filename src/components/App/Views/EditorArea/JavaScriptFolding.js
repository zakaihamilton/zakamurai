export const isJavaScriptPath = (filePath = '') =>
  /\.(jsx?|tsx?|mjs|cjs)$/.test(filePath) || filePath === 'javascript' || filePath === 'typescript';

export function getJavaScriptBlockFolds(code = '', filePath = '') {
  if (!isJavaScriptPath(filePath) || !code) return [];

  const folds = [];
  const stack = [];
  let line = 1;
  let stringQuote = '';
  let escaped = false;
  let inTemplate = false;
  let templateExpressionDepth = 0;
  let inBlockComment = false;
  let inLineComment = false;

  for (let index = 0; index < code.length; index++) {
    const char = code[index];
    const nextChar = code[index + 1];

    if (char === '\n') {
      line++;
      escaped = false;
      inLineComment = false;
      continue;
    }

    if (inLineComment) continue;

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        index++;
      }
      continue;
    }

    if (stringQuote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === stringQuote) {
        stringQuote = '';
      }
      continue;
    }

    if (inTemplate && templateExpressionDepth === 0) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '`') {
        inTemplate = false;
      } else if (char === '$' && nextChar === '{') {
        templateExpressionDepth = 1;
        stack.push({ line, templateExpression: true });
        index++;
      }
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index++;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index++;
      continue;
    }

    if (char === '"' || char === "'") {
      stringQuote = char;
      continue;
    }

    if (char === '`') {
      inTemplate = true;
      continue;
    }

    if (char === '{') {
      if (inTemplate && templateExpressionDepth > 0) templateExpressionDepth++;
      stack.push({ line, templateExpression: inTemplate && templateExpressionDepth > 0 });
      continue;
    }

    if (char === '}') {
      const start = stack.pop();
      if (start && line > start.line && !start.templateExpression) {
        folds.push({
          id: `${start.line}:${line}`,
          startLine: start.line,
          endLine: line,
        });
      }

      if (inTemplate && templateExpressionDepth > 0) {
        templateExpressionDepth--;
      }
    }
  }

  return Array.from(new Map(folds.map((fold) => [fold.id, fold])).values()).sort(
    (a, b) => a.startLine - b.startLine || a.endLine - b.endLine,
  );
}
