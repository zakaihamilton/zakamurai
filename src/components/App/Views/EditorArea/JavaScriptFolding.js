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
