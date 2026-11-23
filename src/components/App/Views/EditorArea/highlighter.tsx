import type { CursorPosition } from '@/types/domain-types';
import highlighterStyles from './Highlighter.module.css';
import {
  MAX_HIGHLIGHT_CHARS,
  createInitialHighlightDebug,
  resolveDebugTokenRanges,
} from './highlightDebug';
import {
  type TokenRecord,
  finalizeHighlightLines,
  insertSourceMarkers,
  resolveTokensAndSearch,
} from './highlightMarkers';
import { createTokenPusher, tokenizeEscapedSource } from './highlightTokenizers';
import { escapeHtml, isJsonPath } from './highlightUtils';
import { shouldDeferEditorAnalysis } from './largeFile';
import type {
  HighlightAnalysisParams,
  HighlightCacheKeyParams,
  HighlightDebug,
  HighlightEditorState,
  HighlightStyles,
} from './types';

const highlightCache = new Map<string, string>();
const MAX_CACHE_SIZE = 50;

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
  const { debug } = createInitialHighlightDebug({
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
  const jsonPath = isJsonPath(filePath);

  if (!code) {
    return { html: '', debug };
  }

  if (shouldDeferEditorAnalysis(code)) {
    return { html: escapeHtml(code), debug };
  }

  const { escaped: markedEscaped, navigationTargets } = insertSourceMarkers({
    code,
    filePath,
    state,
    suggestion,
    cursorPos,
    navigationLinksEnabled,
    isOriginal,
  });
  debug.navigationTargets = navigationTargets;

  const tokens: TokenRecord[] = [];
  const pushToken = createTokenPusher(tokens, debug.tokens, styles);
  const tokenized = tokenizeEscapedSource({
    escaped: markedEscaped,
    filePath,
    jsonPath,
    pushToken,
  });

  resolveDebugTokenRanges(tokenized, code, debug.tokens);

  const { html: resolvedHtml, matchCount } = resolveTokensAndSearch({
    escaped: tokenized,
    tokens,
    styles,
    showFind,
    findQuery,
    matchIndex,
  });
  debug.search.matchCount = matchCount;

  const html = finalizeHighlightLines({
    escaped: resolvedHtml,
    code,
    styles,
    suggestion,
    selectedLines: state.selectedLines?.[filePath] || [],
    isOriginal,
  });

  return { html, debug };
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

  highlightCache.set(cacheKey, result);
  if (highlightCache.size > MAX_CACHE_SIZE) {
    const firstKey = highlightCache.keys().next().value;
    if (firstKey) highlightCache.delete(firstKey);
  }

  return result;
};
