import { findNavigationTargets } from '@/utils/navigation';

const encodeIdx = (num) => String(num).replace(/\d/g, (d) => String.fromCharCode(97 + Number(d)));
const decodeIdx = (str) => Number(str.replace(/[a-j]/g, (c) => String(c.charCodeAt(0) - 97)));

const highlightCache = new Map();
const MAX_CACHE_SIZE = 50;
const MAX_HIGHLIGHT_CHARS = 250000;

const escapeHtml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const isJsonPath = (filePath = '') =>
  filePath.endsWith('.json') ||
  filePath.endsWith('.jsonc') ||
  filePath.endsWith('.webmanifest') ||
  filePath === 'json';

const countLines = (value = '') => (value ? value.split('\n').length : 1);

const getLineColumn = (code = '', index = 0) => {
  const safeIndex = Math.max(0, Math.min(index, code.length));
  let line = 1;
  let column = 1;
  for (let i = 0; i < safeIndex; i++) {
    if (code.charCodeAt(i) === 10) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
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
}) =>
  JSON.stringify([
    code,
    filePath,
    !!state.pendingDiffs?.[filePath],
    state.selectedLines?.[filePath],
    showFind,
    findQuery,
    matchIndex,
    suggestion,
    cursorPos?.index,
    navigationLinksEnabled,
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
  styles = {},
  showFind = false,
  findQuery = '',
  matchIndex = -1,
  suggestion,
  cursorPos,
  navigationLinksEnabled = false,
}) => {
  const jsonPath = isJsonPath(filePath);
  const languageMode = jsonPath ? 'json' : filePath?.endsWith('.css') ? 'css' : 'javascript';
  const debug = {
    filePath,
    languageMode,
    sourceLength: code?.length || 0,
    lineCount: countLines(code || ''),
    maxHighlightChars: MAX_HIGHLIGHT_CHARS,
    cacheable: !!code && code.length <= MAX_HIGHLIGHT_CHARS,
    largeFileFallback: !!code && code.length > MAX_HIGHLIGHT_CHARS,
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

  if (code.length > MAX_HIGHLIGHT_CHARS) {
    return { html: escapeHtml(code), debug };
  }

  const fileDiff = state.pendingDiffs?.[filePath];
  const diffs = fileDiff?.diffs || [];
  const selectedLines = state.selectedLines?.[filePath] || [];
  const sortedDiffs = [...diffs].sort((a, b) => b.start - a.start);

  let escaped = code;

  // Track index mapping
  const mapIndex = new Int32Array(code.length + 1);
  for (let i = 0; i <= code.length; i++) {
    mapIndex[i] = i;
  }
  const shiftIndices = (fromIdx, amount) => {
    for (let i = fromIdx; i <= code.length; i++) {
      mapIndex[i] += amount;
    }
  };

  // 1. Insert target markers when navigation links are enabled
  let targets = [];
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
    const idx = cursorPos.index;
    const mappedIdx = mapIndex[idx];
    escaped = `${escaped.substring(0, mappedIdx)}\u0005${escaped.substring(mappedIdx)}`;
  }

  // 3. Insert diff markers
  for (let i = 0; i < sortedDiffs.length; i++) {
    const diff = sortedDiffs[i];
    const startMapped =
      mapIndex[diff.start] + (hasSuggestion && diff.start >= cursorPos.index ? 1 : 0);
    const endMapped = mapIndex[diff.end] + (hasSuggestion && diff.end >= cursorPos.index ? 1 : 0);

    escaped = `${escaped.substring(0, startMapped)}\u0003${i}\u0003${escaped.substring(
      startMapped,
      endMapped,
    )}\u0004${escaped.substring(endMapped)}`;
  }

  escaped = escapeHtml(escaped);

  const tokens = [];
  const T_PRE = '\x01';
  const T_POST = '\x02';

  const pushToken = (val, type) => {
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
    const rawIndex = plainValue ? code.indexOf(plainValue) : -1;
    debug.tokens.push({
      index: idx,
      type,
      className: styles[type] || type,
      value: plainValue || val,
      escapedValue: val,
      range:
        rawIndex >= 0
          ? {
              start: rawIndex,
              end: rawIndex + plainValue.length,
              startPosition: getLineColumn(code, rawIndex),
              endPosition: getLineColumn(code, rawIndex + plainValue.length),
            }
          : null,
    });
    return `${T_PRE}${idx}${T_POST}`;
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
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      /(\/\*[\s\S]*?\*\/|\/\/.+|(?<=[=({[!&|?:,;+\-*%^~]|=>|\breturn\b|\btypeof\b|\binstanceof\b|\bin\b|\bvoid\b|\bdelete\b|\bnew\b|\bthrow\b|\bcase\b|^)\s*\/(?![/*])(?:[^\/\\\n\[]|\\[^\n]|\\[\n]|\[(?:[^\]\\\n]|\.)*\])*\/[gimsuy]*|"(?:[^"\\\n]|\.)*"|'(?:[^'\n\\\n]|\.)*'|`(?:[^`\\]|\\.)*?`)/gm,
      (m) => {
        if (m.startsWith('//') || m.startsWith('/*')) {
          return pushToken(m, 'hlComment');
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
    escaped = escaped.replace(/([a-zA-Z\-]+)(?=\s*:)/g, (m) => pushToken(m, 'hlProp'));
    // Selectors (basic)
    escaped = escaped.replace(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
      /(^|(?<=\}))(\u0003\d+\u0003|\u0004|\u0005)*([.#a-zA-Z0-9_\-\[\]="':*]+)(?=\s*\{)/gm,
      (_m, p1, p2, p3) => p1 + (p2 || '') + pushToken(p3, 'hlTag'),
    );
    // Values (after colon, before semicolon)
    escaped = escaped.replace(/(?<=:\s*)([^;\}]+)(?=;|\})/g, (m) => {
      // Highlight hex colors within values
      let val = m.replace(/(#[a-fA-F0-9]{3,8})/g, (c) => pushToken(c, 'hlNum'));
      // Highlight units
      val = val.replace(
        /(\d+)(px|rem|em|%|vh|vw|ms|s|deg)/g,
        (_m2, p1, p2) => `${pushToken(p1, 'hlNum')}${pushToken(p2, 'hlKw')}`,
      );
      return val;
    });
    // Variables
    escaped = escaped.replace(/(var\(--[a-zA-Z0-9\-]+\))/g, (m) => pushToken(m, 'hlFunc'));
  } else if (!jsonPath) {
    // JSX/HTML Tags
    escaped = escaped.replace(
      /(&lt;\/?)([a-zA-Z0-9]+)/g,
      (_m, p1, p2) => `${p1}${pushToken(p2, 'hlTag')}`,
    );
    // Functions
    escaped = escaped.replace(/\b([a-zA-Z0-9_]+)(?=\()/g, (m) => pushToken(m, 'hlFunc'));
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

  const highlightText = (text) => {
    if (!searchRegex || !text) return text;
    return text.replace(searchRegex, (m) => {
      const cls = matchCounter === matchIndex ? 'hlMatchActive' : 'hlMatch';
      matchCounter++;
      return `<span class="${styles[cls]}">${m}</span>`;
    });
  };

  const resolveToken = (idx) => {
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

  // Replace diff markers with spans including original content
  // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
  escaped = escaped.replace(/\u0003(\d+)\u0003/g, (_m, idx) => {
    const diff = sortedDiffs[Number(idx)];
    const original = (diff.original || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return `<span class="${styles.diffHighlight}" data-original="${original || 'Added'}">`;
  });
  // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
  escaped = escaped.replace(/\u0004/g, '</span>');

  escaped = escaped.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional
    /\u0005/g,
    `<span class="${styles.hlGhost}" aria-hidden="true">${escapeHtml(suggestion || '')}${
      suggestion ? `<span class="${styles.tabHint}">Press <kbd>Tab</kbd></span>` : ''
    }</span>`,
  );

  // Replace navigation target markers with styled links
  // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
  escaped = escaped.replace(/\u0006([a-j]+)\u0006/g, (_m, idxStr) => {
    const targetIdx = decodeIdx(idxStr);
    return `<span class="${styles.navLink}" data-nav-target="true" data-nav-idx="${targetIdx}">`;
  });
  // biome-ignore lint/suspicious/noControlCharactersInRegex: markers are intentional for tracking
  escaped = escaped.replace(/\u0007/g, '</span>');

  // Add line selection backgrounds
  const linesArr = escaped.split('\n');
  const finalLines = linesArr.map((line, i) => {
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
  styles = {},
  showFind = false,
  findQuery = '',
  matchIndex = -1,
  suggestion,
  cursorPos,
  navigationLinksEnabled = false,
}) =>
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
  }).debug;

export const highlightCode = (
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
) => {
  if (!code) return '';
  if (code.length > MAX_HIGHLIGHT_CHARS) return escapeHtml(code);

  const cacheKey = buildCacheKey({
    code,
    filePath,
    state,
    showFind,
    findQuery,
    matchIndex,
    suggestion,
    cursorPos,
    navigationLinksEnabled,
  });

  if (highlightCache.has(cacheKey)) {
    return highlightCache.get(cacheKey);
  }

  const result = createHighlightAnalysis({
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
  }).html;

  // Store in cache
  highlightCache.set(cacheKey, result);
  if (highlightCache.size > MAX_CACHE_SIZE) {
    const firstKey = highlightCache.keys().next().value;
    highlightCache.delete(firstKey);
  }

  return result;
};
