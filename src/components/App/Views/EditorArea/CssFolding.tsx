import type { CodeFold } from './types';

export const isCssPath = (filePath = ''): boolean =>
  filePath.endsWith('.css') || filePath === 'css';

export function getCssBlockFolds(code = '', filePath = ''): CodeFold[] {
  if (!isCssPath(filePath) || !code) return [];

  const folds: CodeFold[] = [];
  const stack: Array<{ line: number }> = [];
  let line = 1;
  let inString = false;
  let quote = '';
  let escaped = false;
  let inComment = false;

  for (let index = 0; index < code.length; index++) {
    const char = code[index];
    const nextChar = code[index + 1];

    if (char === '\n') {
      line++;
      escaped = false;
      continue;
    }

    if (inComment) {
      if (char === '*' && nextChar === '/') {
        inComment = false;
        index++;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
        quote = '';
      }
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inComment = true;
      index++;
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === '{') {
      stack.push({ line });
      continue;
    }

    if (char === '}') {
      const start = stack.pop();
      if (start && line > start.line) {
        folds.push({
          id: `${start.line}:${line}`,
          startLine: start.line,
          endLine: line,
        });
      }
    }
  }

  return folds.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
}
