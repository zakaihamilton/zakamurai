import type { CursorPosition } from '@/components/state/domain-types';
import { findNavigationTargets } from '@/utils/navigation';
import type { NavigationTarget } from '@/utils/navigation/types';
import highlighterStyles from './Highlighter.module.css';
import {
  countLines,
  decodeIdx,
  encodeIdx,
  escapeHtml,
  getLineColumn,
  isJsonPath,
} from './highlightUtils';
import { MAX_EDITOR_ANALYSIS_CHARS, shouldDeferEditorAnalysis } from './largeFile';
import type {
  HighlightAnalysisParams,
  HighlightCacheKeyParams,
  HighlightDebug,
  HighlightDebugToken,
  HighlightEditorState,
  HighlightStyles,
} from './types';

const highlightCache = new Map<string, string>();
const MAX_CACHE_SIZE = 50;
const MAX_HIGHLIGHT_CHARS = MAX_EDITOR_ANALYSIS_CHARS;

const resolveDebugTokenRanges = (
  highlighted: string,
  code: string,
  debugTokens: HighlightDebugToken[],
) => {
  let highlightIdx = 0;
  let codeIdx = 0;

  const advanceHighlight = () => {
    if (highlightIdx >= highlighted.length) return;

    if (highlighted.startsWith('&amp;', highlightIdx)) {
      highlightIdx += 5;
      codeIdx += 1;
      return;
    }
    if (highlighted.startsWith('&lt;', highlightIdx)) {
      highlightIdx += 4;
      codeIdx += 1;
      return;
    }
    if (highlighted.startsWith('&gt;', highlightIdx)) {
      highlightIdx += 4;
      codeIdx += 1;
      return;
    }

    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    const navStart = highlighted.slice(highlightIdx).match(/^\u0006[a-j]+\u0006/);
    if (navStart) {
      highlightIdx += navStart[0].length;
      return;
    }
    if (highlighted[highlightIdx] === '\u0007') {
      highlightIdx += 1;
      return;
    }
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    const diffStart = highlighted.slice(highlightIdx).match(/^\u0003\d+\u0003/);
    if (diffStart) {
      highlightIdx += diffStart[0].length;
      return;
    }
    if (highlighted[highlightIdx] === '\u0004' || highlighted[highlightIdx] === '\u0005') {
      highlightIdx += 1;
      return;
    }

    highlightIdx += 1;
    codeIdx += 1;
  };

  while (highlightIdx < highlighted.length) {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    const markerMatch = highlighted.slice(highlightIdx).match(/^\x01(\d+)\x02/);
    if (markerMatch) {
      const tokenIndex = Number.parseInt(markerMatch[1], 10);
      const debugToken = debugTokens[tokenIndex];
      if (debugToken) {
        const value = debugToken.value || '';
        const start = codeIdx;
        const end = codeIdx + value.length;
        debugToken.range = {
          start,
          end,
          startPosition: getLineColumn(code, start),
          endPosition: getLineColumn(code, end),
        };
        codeIdx = end;
      }
      highlightIdx += markerMatch[0].length;
      continue;
    }

    advanceHighlight();
  }
};

const buildCacheKey = ({
  code,
  filePath,
  state,
  showFind,
  findQuery,
  matchIndex,
  suggestion,
  cursorPos,
  navigationLinksEnabled,
  isOriginal = false,
}: HighlightCacheKeyParams) =>
  JSON.stringify([
    code,
    filePath,
    !!state?.pendingDiffs?.[filePath],
    state?.selectedLines?.[filePath],
    showFind,
    findQuery,
    matchIndex,
    suggestion,
    cursorPos?.index,
    navigationLinksEnabled,
    isOriginal,
    navigationLinksEnabled
      ? Object.entries(state?.fileContents || {})
          .map(([k, v]) => `${k}:${v?.length || 0}`)
          .join(',')
      : '',
  ]);

const createHighlightAnalysis = ({
  code,
  filePath,
  state = {},
  styles = highlighterStyles,
  showFind = false,
  findQuery = '',
  matchIndex = -1,
  suggestion,
  cursorPos,
  navigationLinksEnabled = false,
  isOriginal = false,
}: HighlightAnalysisParams) => {
  const jsonPath = isJsonPath(filePath);
  const languageMode = jsonPath ? 'json' : filePath?.endsWith('.css') ? 'css' : 'javascript';
  const debug: HighlightDebug = {
    filePath,
    languageMode,
    sourceLength: code?.length || 0,
    lineCount: countLines(code || ''),
    maxHighlightChars: MAX_HIGHLIGHT_CHARS,
    cacheable: !!code && !shouldDeferEditorAnalysis(code),
    largeFileFallback: !!code && shouldDeferEditorAnalysis(code),
    selectedLines: state.selectedLines?.[filePath] || [],
    diffs: state.pendingDiffs?.[filePath]?.diffs || [],
    suggestion: suggestion
      ? {
          text: suggestion,
          cursorIndex: cursorPos?.index,
          cursorPosition:
            cursorPos?.index !== undefined ? getLineColumn(code || '', cursorPos.index) : null,
        }
      : null,
    navigationLinksEnabled,
    navigationTargets: [],
    search: {
      enabled: !!(showFind && findQuery),
      query: findQuery || '',
      activeMatchIndex: matchIndex,
      matchCount: 0,
    },
    tokens: [],
  };

  if (!code) {
    return { html: '', debug };
  }

  if (shouldDeferEditorAnalysis(code)) {
    return { html: escapeHtml(code), debug };
  }

  const fileDiff = state.pendingDiffs?.[filePath];
  const diffs = fileDiff?.diffs || [];
  const selectedLines = state.selectedLines?.[filePath] || [];
  const sortedDiffs = [...diffs].sort((a, b) => {
    const startA = isOriginal ? (a.origStart ?? a.start ?? 0) : (a.start ?? 0);
    const startB = isOriginal ? (b.origStart ?? b.start ?? 0) : (b.start ?? 0);
    return startB - startA;
  });

  const END_OF_SOURCE = '\u0008';
  let escaped = `${code}${END_OF_SOURCE}`;

  // Track index mapping
  const mapIndex = new Int32Array(code.length + 1);
  for (let i = 0; i <= code.length; i++) {
    mapIndex[i] = i;
  }
  const shiftIndices = (fromIdx: number, amount: number) => {
    for (let i = fromIdx; i <= code.length; i++) {
      mapIndex[i] += amount;
    }
  };

  // Insert diff markers before navigation markers. Diff offsets are source offsets;
  // inserting navigation markers first made the mapping drift in JSX with many links.
  for (let i = 0; i < sortedDiffs.length; i++) {
    const diff = sortedDiffs[i];
    // Pure insertions have no removed text on the original side.
    if (isOriginal && !diff.original) continue;
    const finalStart = isOriginal ? (diff.origStart ?? diff.start ?? 0) : (diff.start ?? 0);
    const finalEnd = isOriginal ? (diff.origEnd ?? diff.end ?? 0) : (diff.end ?? 0);
    const endMapped = mapIndex[finalEnd];
    escaped = `${escaped.substring(0, endMapped)}\u0004${escaped.substring(endMapped)}`;
    shiftIndices(finalEnd, 1);

    const startMarker = `\u0003${i}\u0003`;
    const startMapped = mapIndex[finalStart];
    escaped = `${escaped.substring(0, startMapped)}${startMarker}${escaped.substring(startMapped)}`;
    shiftIndices(finalStart, startMarker.length);
  }

  // 1. Insert target markers when navigation links are enabled
  let targets: NavigationTarget[] = [];
  if (navigationLinksEnabled) {
    targets = findNavigationTargets(
      code,
      filePath?.endsWith('.css'),
      state?.fileContents || {},
      filePath,
    );
  }
  debug.navigationTargets = targets.map((target) => ({
    ...target,
    position: getLineColumn(code, target.start),
  }));

  // Sort targets in descending order of start index to insert without interference
  const sortedTargets = [...targets].sort((a, b) => b.start - a.start);
  for (let idx = 0; idx < sortedTargets.length; idx++) {
    const target = sortedTargets[idx];
    const targetIdx = targets.indexOf(target);

    const endPos = mapIndex[target.end];
    escaped = `${escaped.substring(0, endPos)}\u0007${escaped.substring(endPos)}`;
    shiftIndices(target.end, 1);

    const startMarker = `\u0006${encodeIdx(targetIdx)}\u0006`;
    const startPos = mapIndex[target.start];
    escaped = `${escaped.substring(0, startPos)}${startMarker}${escaped.substring(startPos)}`;
    shiftIndices(target.start, startMarker.length);
  }

  // 2. Insert suggestion marker
  const hasSuggestion = suggestion && cursorPos && cursorPos.index !== undefined;
  if (hasSuggestion) {
    const idx = cursorPos.index ?? 0;
    const mappedIdx = mapIndex[idx];
    escaped = `${escaped.substring(0, mappedIdx)}\u0005${escaped.substring(mappedIdx)}`;
  }

  escaped = escapeHtml(escaped);

  const tokens: Array<{ val: string; type: string }> = [];
  const T_PRE = '\x01';
  const T_POST = '\x02';

  const pushToken = (val: string, type: string): string => {
    if (val.includes('\n')) {
      return val
        .split('\n')
        .map((part) => (part ? pushToken(part, type) : ''))
        .join('\n');
    }

    const idx = tokens.length;
    tokens.push({ val, type });
    const plainValue = val
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      .replace(/\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    debug.tokens.push({
      index: idx,
      type,
      className: styles[type] || type,
      value: plainValue || val,
      escapedValue: val,
      range: null,
    });
    return `${T_PRE}${idx}${T_POST}`;
  };

  const findTemplateExpressionEnd = (value: string, expressionStart: number): number => {
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
  };

  const highlightTemplateLiteral = (value: string): string => {
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
  };

  if (jsonPath) {
    // JSON keys and strings need different contrast, especially in light mode.
    escaped = escaped.replace(/("(?:[^"\\\\]|\\\\.)*")(?=\s*:)/g, (m) => pushToken(m, 'hlJsonKey'));
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
  } else {
    // 1. Strings, regex literals, and comments matched in a single pass to prevent
    // slashes inside regex from being mis-identified as the // comment start.
    //
    // Regex literal arm: only matches when preceded by an operator/keyword/open-bracket
    // (i.e. not after an identifier, number, closing bracket — where / would be division).
    escaped = escaped.replace(
      /(\/\*[\s\S]*?\*\/|\/\/.+|(?<=[=({[!&|?:,;+\-*%^~]|=>|\breturn\b|\btypeof\b|\binstanceof\b|\bin\b|\bvoid\b|\bdelete\b|\bnew\b|\bthrow\b|\bcase\b|^)\s*\/(?![/*])(?:[^\/\\\n\[]|\\[^\n]|\\[\n]|\[(?:[^\]\\\n]|\.)*\])*\/[gimsuy]*|"(?:[^"\\\n]|\.)*"|'(?:[^'\n\\\n]|\.)*'|`(?:[^`\\]|\\.)*?`)/gm,
      (m) => {
        if (m.startsWith('//') || m.startsWith('/*')) {
          return pushToken(m, 'hlComment');
        }
        if (m.startsWith('`')) {
          return highlightTemplateLiteral(m);
        }
        // regex literals are treated as opaque (similar to strings)
        if (m.startsWith('/')) {
          return pushToken(m, 'hlStr');
        }
        return pushToken(m, 'hlStr');
      },
    );
  }

  // 3. Language specific (CSS or JSX/HTML)
  if (filePath?.endsWith('.css')) {
    // Properties
    escaped = escaped.replace(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|([a-zA-Z\-]+)(?=\s*(?:\u0007|\u0004)?\s*:)/g,
      (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlProp')),
    );
    // Selectors (basic & comma-separated list support)
    escaped = escaped.replace(/(^|(?<=\}))([^\{\}]+)(?=\s*\{)/g, (selectorList) => {
      return selectorList.replace(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
        /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|([.#a-zA-Z0-9_\-\[\]="':*]+)/g,
        (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlTag')),
      );
    });
    // Values (after colon, before semicolon)
    escaped = escaped.replace(/(?<=:\s*)([^;\}]+)(?=;|\})/g, (m) => {
      // Highlight hex colors within values
      let val = m.replace(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
        /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|(#[a-fA-F0-9]{3,8})/g,
        (_m2, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlNum')),
      );
      // Highlight units
      val = val.replace(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
        /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|(\d+)(px|rem|em|%|vh|vw|ms|s|deg)/g,
        (_m2, p1, p2, p3) => (p1 ? p1 : `${pushToken(p2, 'hlNum')}${pushToken(p3, 'hlKw')}`),
      );
      // Highlight functions (e.g. rgb, rgba, calc, var, etc.)
      val = val.replace(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
        /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|([a-zA-Z\-]+)(?=\()/g,
        (_m2, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlFunc')),
      );
      // Highlight other numbers (e.g. unitless numbers)
      val = val.replace(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
        /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|(-?\d+(?:\.\d+)?)/g,
        (_m2, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlNum')),
      );
      // Highlight remaining identifiers/keywords (e.g. solid, red, block, none, etc.)
      val = val.replace(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
        /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|([a-zA-Z0-9\-]+)/g,
        (_m2, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlVal')),
      );
      return val;
    });
    // Variables (for any variables outside standard values or fallback handling)
    escaped = escaped.replace(/(var\(--[a-zA-Z0-9\-]+\))/g, (m) => pushToken(m, 'hlFunc'));
  } else if (!jsonPath) {
    // JSX/HTML Tags
    escaped = escaped.replace(
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
  }

  // 4. Keywords
  if (!jsonPath) {
    escaped = escaped.replace(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|\b(export|default|function|return|import|from|const|let|var|if|else|for|while|class|extends|new|true|false|null|undefined|async|await|try|catch|finally|throw|break|continue|case|switch|type|interface|enum|public|private|protected|static|readonly)\b/g,
      (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlKw')),
    );
  }

  // 5. Numbers
  if (!jsonPath) {
    escaped = escaped.replace(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      /(\x01\d+\x02|\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007)|\b(\d+)\b/g,
      (_m, p1, p2) => (p1 ? p1 : pushToken(p2, 'hlNum')),
    );
  }

  resolveDebugTokenRanges(escaped, code, debug.tokens);

  // Search highlights
  let matchCounter = 0;
  const searchRegex =
    showFind && findQuery
      ? new RegExp(
          findQuery
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;'),
          'gi',
        )
      : null;

  const highlightText = (text: string): string => {
    if (!searchRegex || !text) return text;
    return text.replace(searchRegex, (m) => {
      const cls = matchCounter === matchIndex ? 'hlMatchActive' : 'hlMatch';
      matchCounter++;
      return `<span class="${styles[cls]}">${m}</span>`;
    });
  };

  const resolveToken = (idx: number): string => {
    const token = tokens[idx];
    if (!token) return '';

    // Split content to handle nested tokens
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    const parts = token.val.split(/(\x01\d+\x02)/);
    const resolvedContent = parts
      .map((part) => {
        // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
        const match = part.match(/^\x01(\d+)\x02$/);
        if (match) return resolveToken(Number.parseInt(match[1]));
        return highlightText(part);
      })
      .join('');

    return `<span class="${styles[token.type] || ''}">${resolvedContent}</span>`;
  };

  // Final Reconstruction
  // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
  const parts = escaped.split(/(\x01\d+\x02)/);
  escaped = parts
    .map((part) => {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      const match = part.match(/^\x01(\d+)\x02$/);
      if (match) return resolveToken(Number.parseInt(match[1]));
      return highlightText(part);
    })
    .join('');

  debug.search.matchCount = matchCounter;

  const openDiffSpan = (idx: number): string => {
    void idx;
    if (isOriginal) {
      return `<span class="${styles.diffDeleteHighlight || 'diffDeleteHighlight'}">`;
    }
    return `<span class="${styles.diffHighlight}">`;
  };

  escaped = escaped.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional
    /\u0005/g,
    `<span class="${styles.hlGhost}" aria-hidden="true">${escapeHtml(suggestion || '')}${
      suggestion ? `<span class="${styles.tabHint}">Press <kbd>Tab</kbd></span>` : ''
    }</span>`,
  );

  const endOfSourceIndex = escaped.indexOf(END_OF_SOURCE);
  if (endOfSourceIndex !== -1) escaped = escaped.slice(0, endOfSourceIndex);

  // Replace navigation target markers with styled links
  // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
  escaped = escaped.replace(/\u0006([a-j]+)\u0006/g, (_m, idxStr) => {
    const targetIdx = decodeIdx(idxStr);
    return `<span class="${styles.navLink}" data-nav-target="true" data-nav-idx="${targetIdx}">`;
  });
  // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
  escaped = escaped.replace(/\u0007/g, '</span>');

  // Add line selection backgrounds
  const linesArr = escaped.split('\n').slice(0, countLines(code));
  let activeDiff: number | null = null;
  const finalLines = linesArr.map((rawLine, i) => {
    let line = activeDiff === null ? rawLine : `${openDiffSpan(activeDiff)}${rawLine}`;
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
    line = line.replace(/\u0003(\d+)\u0003/g, (_marker, idx) => {
      activeDiff = Number(idx);
      return openDiffSpan(activeDiff);
    });
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
    line = line.replace(/\u0004/g, () => {
      activeDiff = null;
      return '</span>';
    });
    if (activeDiff !== null) line += '</span>';
    const isSelected = selectedLines.includes(i + 1);
    const lineClass = isSelected ? styles.selectedLineRow : '';
    return `<span class="${styles.lineRow || 'lineRow'} ${lineClass}" data-line="${i + 1}" style="display: block;">${line || ' '}</span>`;
  });

  return { html: finalLines.join(''), debug };
};

export const getHighlightBreakdown = ({
  code = '',
  filePath = '',
  state = {},
  styles = highlighterStyles,
  showFind = false,
  findQuery = '',
  matchIndex = -1,
  suggestion,
  cursorPos,
  navigationLinksEnabled = false,
  isOriginal = false,
}: HighlightAnalysisParams): HighlightDebug =>
  createHighlightAnalysis({
    code,
    filePath,
    state,
    styles,
    showFind,
    findQuery,
    matchIndex,
    suggestion,
    cursorPos,
    navigationLinksEnabled,
    isOriginal,
  }).debug;

export const highlightCode = (
  code: string,
  filePath: string,
  state: HighlightEditorState = {},
  styles?: HighlightStyles,
  showFind?: boolean,
  findQuery?: string,
  matchIndex?: number,
  suggestion?: string,
  cursorPos?: CursorPosition,
  navigationLinksEnabled?: boolean,
  isOriginal = false,
): string => {
  if (!code) return '';
  if (code.length > MAX_HIGHLIGHT_CHARS) return escapeHtml(code);

  const cacheKey = buildCacheKey({
    code,
    filePath,
    state,
    showFind: showFind ?? false,
    findQuery: findQuery ?? '',
    matchIndex: matchIndex ?? -1,
    suggestion,
    cursorPos,
    navigationLinksEnabled: navigationLinksEnabled ?? false,
    isOriginal,
  });

  if (highlightCache.has(cacheKey)) {
    return highlightCache.get(cacheKey) ?? '';
  }

  const result = createHighlightAnalysis({
    code,
    filePath,
    state,
    styles: styles ?? highlighterStyles,
    showFind,
    findQuery,
    matchIndex,
    suggestion,
    cursorPos,
    navigationLinksEnabled,
    isOriginal,
  }).html;

  // Store in cache
  highlightCache.set(cacheKey, result);
  if (highlightCache.size > MAX_CACHE_SIZE) {
    const firstKey = highlightCache.keys().next().value;
    if (firstKey) highlightCache.delete(firstKey);
  }

  return result;
};
