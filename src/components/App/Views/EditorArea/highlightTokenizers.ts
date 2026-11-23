import { extractPlainDebugTokenValue } from './highlightDebug';
import type { TokenRecord } from './highlightMarkers';
import type { HighlightDebugToken, HighlightStyles } from './types';

export type PushTokenFn = (val: string, type: string) => string;

const T_PRE = '\x01';
const T_POST = '\x02';

export function createTokenPusher(
  tokens: TokenRecord[],
  debugTokens: HighlightDebugToken[],
  styles: HighlightStyles,
): PushTokenFn {
  const pushToken: PushTokenFn = (val, type) => {
    if (val.includes('\n')) {
      return val
        .split('\n')
        .map((part) => (part ? pushToken(part, type) : ''))
        .join('\n');
    }

    const idx = tokens.length;
    tokens.push({ val, type });
    debugTokens.push({
      index: idx,
      type,
      className: styles[type] || type,
      value: extractPlainDebugTokenValue(val),
      escapedValue: val,
      range: null,
    });
    return `${T_PRE}${idx}${T_POST}`;
  };

  return pushToken;
}

function findTemplateExpressionEnd(value: string, expressionStart: number): number {
  let depth = 1;
  let i = expressionStart;
  let quote: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < value.length) {
    const char = value[i];
    const next = value[i + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      i++;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (quote) {
      if (char === '\\') {
        i += 2;
      } else {
        if (char === quote) quote = null;
        i++;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      i++;
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }

  return -1;
}

function highlightTemplateLiteral(value: string, pushToken: PushTokenFn): string {
  let result = '';
  let segmentStart = 0;
  let i = 1;

  while (i < value.length - 1) {
    if (value[i] === '\\') {
      i += 2;
      continue;
    }

    if (value[i] === '$' && value[i + 1] === '{') {
      const expressionEnd = findTemplateExpressionEnd(value, i + 2);
      if (expressionEnd === -1) break;

      if (segmentStart < i) {
        result += pushToken(value.slice(segmentStart, i), 'hlStr');
      }
      result += pushToken('${', 'hlStr');
      result += value.slice(i + 2, expressionEnd);
      result += pushToken('}', 'hlStr');
      i = expressionEnd + 1;
      segmentStart = i;
      continue;
    }

    i++;
  }

  if (segmentStart < value.length) {
    result += pushToken(value.slice(segmentStart), 'hlStr');
  }

  return result;
}

function tokenizeJson(source: string, pushToken: PushTokenFn): string {
  // JSON keys and strings need different contrast, especially in light mode.
  let escaped = source.replace(/("(?:[^"\\\\]|\\\\.)*")(?=\s*:)/g, (m) =>
    pushToken(m, 'hlJsonKey'),
  );
  escaped = escaped.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    /(\x01\d+\x02)|("(?:[^"\\\\]|\\\\.)*")/g,
    (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlStr')),
  );
  escaped = escaped.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    /(\x01\d+\x02)|\b(true|false|null)\b/g,
    (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlJsonBool')),
  );
  escaped = escaped.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    /(\x01\d+\x02)|\b(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/gi,
    (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlNum')),
  );
  escaped = escaped.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    /(\x01\d+\x02)|([{}[\],:])/g,
    (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlJsonPunc')),
  );
  return escaped;
}

function tokenizeCss(source: string, pushToken: PushTokenFn): string {
  // Properties
  let escaped = source.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|([a-zA-Z\-]+)(?=\s*(?:\u0007|\u0004)?\s*:)/g,
    (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlProp')),
  );
  // Selectors (basic & comma-separated list support)
  escaped = escaped.replace(/(^|(?<=\}))([^\{\}]+)(?=\s*\{)/g, (selectorList) =>
    selectorList.replace(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|([.#a-zA-Z0-9_\-\[\]="':*]+)/g,
      (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlTag')),
    ),
  );
  // Values (after colon, before semicolon)
  escaped = escaped.replace(/(?<=:\s*)([^;\}]+)(?=;|\})/g, (m) => {
    let val = m.replace(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|(#[a-fA-F0-9]{3,8})/g,
      (_m2, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlNum')),
    );
    val = val.replace(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|(\d+)(px|rem|em|%|vh|vw|ms|s|deg)/g,
      (_m2, p1, p2, p3) => (p1 ? p1 : `${pushToken(p2, 'hlNum')}${pushToken(p3, 'hlKw')}`),
    );
    val = val.replace(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|([a-zA-Z\-]+)(?=\()/g,
      (_m2, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlFunc')),
    );
    val = val.replace(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|(-?\d+(?:\.\d+)?)/g,
      (_m2, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlNum')),
    );
    val = val.replace(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|([a-zA-Z0-9\-]+)/g,
      (_m2, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlVal')),
    );
    return val;
  });
  // Variables (for any variables outside standard values or fallback handling)
  escaped = escaped.replace(/(var\(--[a-zA-Z0-9\-]+\))/g, (m) => pushToken(m, 'hlFunc'));
  return escaped;
}

function tokenizeJavaScript(source: string, pushToken: PushTokenFn): string {
  // JSX/HTML Tags
  let escaped = source.replace(
    /(&lt;\/?)([a-zA-Z0-9]+)/g,
    (_m, p1, p2) => `${p1}${pushToken(p2, 'hlTag')}`,
  );
  // Object keys and member properties
  escaped = escaped.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|\b([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*:)/g,
    (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlProp')),
  );
  escaped = escaped.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|(\?\.|\.)([a-zA-Z_$][a-zA-Z0-9_$]*)(?![a-zA-Z0-9_$])(?!\s*\()/g,
    (_m, p1, p2, p3) => (p1 ? p1 : `${p2}${pushToken(p3, 'hlProp')}`),
  );
  // Functions
  escaped = escaped.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|\b([a-zA-Z0-9_]+)(?=\()/g,
    (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlFunc')),
  );
  // Attributes
  escaped = escaped.replace(/\b([a-zA-Z\-]+)(?==)/g, (m) => pushToken(m, 'hlAttr'));
  return escaped;
}

export function tokenizeEscapedSource({
  escaped: initialEscaped,
  filePath,
  jsonPath,
  pushToken,
}: {
  escaped: string;
  filePath: string;
  jsonPath: boolean;
  pushToken: PushTokenFn;
}): string {
  if (jsonPath) {
    return tokenizeJson(initialEscaped, pushToken);
  }

  // 1. Strings, regex literals, and comments matched in a single pass to prevent
  // slashes inside regex from being mis-identified as the // comment start.
  let escaped = initialEscaped.replace(
    /(\/\*[\s\S]*?\*\/|\/\/.+|(?<=[=({[!&|?:,;+\-*%^~]|=>|\breturn\b|\btypeof\b|\binstanceof\b|\bin\b|\bvoid\b|\bdelete\b|\bnew\b|\bthrow\b|\bcase\b|^)\s*\/(?![/*])(?:[^\/\\\n\[]|\\[^\n]|\\[\n]|\[(?:[^\]\\\n]|\.)*\])*\/[gimsuy]*|"(?:[^"\\\n]|\.)*"|'(?:[^'\n\\\n]|\.)*'|`(?:[^`\\]|\\.)*?`)/gm,
    (m) => {
      if (m.startsWith('//') || m.startsWith('/*')) {
        return pushToken(m, 'hlComment');
      }
      if (m.startsWith('`')) {
        return highlightTemplateLiteral(m, pushToken);
      }
      return pushToken(m, 'hlStr');
    },
  );

  // 2. Language specific (CSS or JSX/HTML)
  if (filePath?.endsWith('.css')) {
    escaped = tokenizeCss(escaped, pushToken);
  } else {
    escaped = tokenizeJavaScript(escaped, pushToken);
  }

  // 3. Keywords
  escaped = escaped.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|\b(export|default|function|return|import|from|const|let|var|if|else|for|while|class|extends|new|true|false|null|undefined|async|await|try|catch|finally|throw|break|continue|case|switch|type|interface|enum|public|private|protected|static|readonly)\b/g,
    (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlKw')),
  );

  // 4. Numbers
  escaped = escaped.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|\b(\d+)\b/g,
    (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlNum')),
  );

  return escaped;
}
