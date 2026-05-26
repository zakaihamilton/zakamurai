export const isJavaScriptPath = (filePath = '') =>
  /\.(jsx?|tsx?|mjs|cjs)$/.test(filePath) || filePath === 'javascript' || filePath === 'typescript';

const isJsxPath = (filePath = '') => /\.(jsx|tsx)$/.test(filePath);

export function getJavaScriptBlockFolds(code = '', filePath = '') {
  if (!isJavaScriptPath(filePath) || !code) return [];

  const folds = [];
  const stack = [];
  const jsxStack = [];
  const includeJsxFolds = isJsxPath(filePath);
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

    if (includeJsxFolds && char === '<') {
      const parsedTag = parseJsxTag(code, index);
      if (parsedTag) {
        if (parsedTag.type === 'open' && !parsedTag.selfClosing) {
          jsxStack.push({ line, name: parsedTag.name });
        } else if (parsedTag.type === 'close') {
          const startIndex = findLastMatchingJsxTag(jsxStack, parsedTag.name);
          if (startIndex !== -1) {
            const start = jsxStack.splice(startIndex, 1)[0];
            if (line > start.line) {
              folds.push({
                id: `jsx:${start.line}:${line}:${start.name}`,
                startLine: start.line,
                endLine: line,
                placeholder: ` ... </${parsedTag.name}>`,
              });
            }
          }
        }
        index = parsedTag.endIndex;
        continue;
      }
    }

    if (char === '{') {
      if (inTemplate && templateExpressionDepth > 0) templateExpressionDepth++;
      const isTemplateExpression = inTemplate && templateExpressionDepth > 0;
      const startLine = isTemplateExpression ? line : getBlockStartLine(code, index, line);
      stack.push({ line: startLine, templateExpression: isTemplateExpression });
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

function getBlockStartLine(code, braceIndex, fallbackLine) {
  const lineStart = code.lastIndexOf('\n', braceIndex - 1) + 1;
  const beforeBraceOnLine = code.slice(lineStart, braceIndex);
  const afterBraceLineEnd = code.indexOf('\n', braceIndex);
  const afterBraceOnLine = code.slice(
    braceIndex + 1,
    afterBraceLineEnd === -1 ? code.length : afterBraceLineEnd,
  );

  if (!/^\s*(?:\)|=>)?\s*$/.test(beforeBraceOnLine) || /\S/.test(afterBraceOnLine)) {
    return fallbackLine;
  }

  if (beforeBraceOnLine.trim().startsWith(')')) {
    const openParenIndex = findMatchingOpenParen(code, braceIndex);
    if (openParenIndex !== -1) return getLineForIndex(code, openParenIndex);
  }

  let cursor = lineStart - 2;
  while (cursor >= 0 && /\s/.test(code[cursor])) cursor--;
  if (cursor < 0) return fallbackLine;

  let depth = 0;
  for (; cursor >= 0; cursor--) {
    const char = code[cursor];

    if (char === ')' || char === ']' || char === '}') {
      depth++;
      continue;
    }

    if (char === '(' || char === '[' || char === '{') {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (depth === 0 && (char === ';' || char === '\n' || char === '{' || char === '}')) {
      break;
    }
  }

  const statementStart = cursor + 1;
  return getLineForIndex(code, statementStart);
}

function findMatchingOpenParen(code, beforeIndex) {
  let depth = 0;
  for (let index = beforeIndex - 1; index >= 0; index--) {
    const char = code[index];
    if (char === ')') {
      depth++;
      continue;
    }

    if (char === '(') {
      depth--;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function getLineForIndex(code, targetIndex) {
  let line = 1;
  for (let index = 0; index < targetIndex; index++) {
    if (code.charCodeAt(index) === 10) line++;
  }

  return line;
}

function parseJsxTag(code, startIndex) {
  const nextChar = code[startIndex + 1];
  if (nextChar === undefined) return null;
  if (nextChar === '=' || nextChar === '!' || nextChar === '?') return null;

  let index = startIndex + 1;
  let type = 'open';

  if (code[index] === '/') {
    type = 'close';
    index++;
  }

  let name = '';
  if (code[index] === '>') {
    name = '';
  } else {
    const nameMatch = code.slice(index).match(/^[A-Za-z][\w:.-]*/);
    if (!nameMatch) return null;
    name = nameMatch[0];
    index += name.length;
  }

  let quote = '';
  let expressionDepth = 0;
  let endIndex = -1;

  for (; index < code.length; index++) {
    const char = code[index];

    if (quote) {
      if (char === quote && code[index - 1] !== '\\') quote = '';
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '{') {
      expressionDepth++;
      continue;
    }

    if (char === '}') {
      expressionDepth = Math.max(0, expressionDepth - 1);
      continue;
    }

    if (char === '>' && expressionDepth === 0) {
      endIndex = index;
      break;
    }
  }

  if (endIndex === -1) return null;

  return {
    type,
    name,
    selfClosing: type === 'open' && code[endIndex - 1] === '/',
    endIndex,
  };
}

function findLastMatchingJsxTag(stack, name) {
  for (let index = stack.length - 1; index >= 0; index--) {
    if (stack[index].name === name) return index;
  }
  return -1;
}
