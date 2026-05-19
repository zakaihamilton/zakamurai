export const isJsonPath = (filePath = '') =>
  filePath.endsWith('.json') ||
  filePath.endsWith('.jsonc') ||
  filePath.endsWith('.webmanifest') ||
  filePath === 'json';

export function getJsonObjectFolds(code = '', filePath = '') {
  if (!isJsonPath(filePath) || !code) return [];

  const folds = [];
  const stack = [];
  let line = 1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < code.length; index++) {
    const char = code[index];

    if (char === '\n') {
      line++;
      escaped = false;
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
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
