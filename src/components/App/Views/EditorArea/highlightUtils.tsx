export const encodeIdx = (num: number): string =>
  String(num).replace(/\d/g, (digit) => String.fromCharCode(97 + Number(digit)));

export const decodeIdx = (value: string): number =>
  Number(value.replace(/[a-j]/g, (character) => String(character.charCodeAt(0) - 97)));

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const isJsonPath = (filePath = ''): boolean =>
  filePath.endsWith('.json') ||
  filePath.endsWith('.jsonc') ||
  filePath.endsWith('.webmanifest') ||
  filePath === 'json';

export const countLines = (value = ''): number => (value ? value.split('\n').length : 1);

export const getLineColumn = (code = '', index = 0): { line: number; column: number } => {
  const safeIndex = Math.max(0, Math.min(index, code.length));
  let line = 1;
  let column = 1;
  for (let cursor = 0; cursor < safeIndex; cursor++) {
    if (code.charCodeAt(cursor) === 10) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
};
