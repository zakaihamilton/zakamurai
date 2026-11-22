export const escapeRegExp = (value: string): string => value.replace(/[.+^${}()|[\]\\]/g, '\\$&');

export const extractBalancedBraces = (text: string, openIndex: number): string | null => {
  if (text[openIndex] !== '{') return null;
  let depth = 0;
  let inString: '"' | "'" | '`' | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;
  for (let index = openIndex; index < text.length; index++) {
    const char = text[index];
    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && text[index + 1] === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === inString) inString = null;
      continue;
    }
    if (char === '/' && text[index + 1] === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && text[index + 1] === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex, index + 1);
    }
  }
  return null;
};

export const findJsxTagEnd = (content: string, start: number): number => {
  let quote: string | null = null;
  let braceDepth = 0;
  let escaped = false;
  for (let index = start; index < content.length; index++) {
    const char = content[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') {
      braceDepth += 1;
      continue;
    }
    if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (char === '>' && braceDepth === 0) return index;
  }
  return -1;
};

export const findMatchingJsxClose = (content: string, openEnd: number, tagName: string): number => {
  let depth = 1;
  for (let index = openEnd + 1; index < content.length; index++) {
    if (content[index] !== '<') continue;
    const tagEnd = findJsxTagEnd(content, index + 1);
    if (tagEnd < 0) return -1;
    const tag = content.slice(index + 1, tagEnd).trim();
    const closing = tag.startsWith('/');
    const normalizedTag = (closing ? tag.slice(1) : tag).trim();
    const nameMatch = /^([A-Za-z][\w.-]*)\b/.exec(normalizedTag);
    if (!nameMatch || nameMatch[1] !== tagName) {
      index = tagEnd;
      continue;
    }
    if (closing) {
      depth -= 1;
      if (depth === 0) return index;
    } else if (!/\/\s*$/.test(normalizedTag)) {
      depth += 1;
    }
    index = tagEnd;
  }
  return -1;
};

export type FunctionSpan = {
  name: string;
  start: number;
  end: number;
  body: string;
};

export const topLevelFunctionSpans = (content: string): FunctionSpan[] => {
  const functions: FunctionSpan[] = [];
  for (const match of content.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) {
    const start = match.index ?? 0;
    const openIndex = start + match[0].length - 1;
    const body = extractBalancedBraces(content, openIndex);
    if (!body) continue;
    if (functions.some((candidate) => start > candidate.start && start < candidate.end)) continue;
    functions.push({ name: match[1], start, end: openIndex + body.length, body });
  }
  return functions;
};
