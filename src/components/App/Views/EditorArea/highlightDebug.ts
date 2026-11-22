import { countLines, getLineColumn, isJsonPath } from './highlightUtils';
import { MAX_EDITOR_ANALYSIS_CHARS, shouldDeferEditorAnalysis } from './largeFile';
import type { HighlightAnalysisParams, HighlightDebug, HighlightDebugToken } from './types';

export const MAX_HIGHLIGHT_CHARS = MAX_EDITOR_ANALYSIS_CHARS;

export function createInitialHighlightDebug({
  code,
  filePath,
  state = {},
  showFind = false,
  findQuery = '',
  matchIndex = -1,
  suggestion,
  cursorPos,
  navigationLinksEnabled = false,
}: Pick<
  HighlightAnalysisParams,
  | 'code'
  | 'filePath'
  | 'state'
  | 'showFind'
  | 'findQuery'
  | 'matchIndex'
  | 'suggestion'
  | 'cursorPos'
  | 'navigationLinksEnabled'
>): { debug: HighlightDebug; jsonPath: boolean } {
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

  return { debug, jsonPath };
}

export function extractPlainDebugTokenValue(val: string): string {
  const plain = val
    // biome-ignore lint/suspicious/noControlCharactersInRegex: markers
    .replace(/\u0003\d+\u0003|\u0004|\u0005|\u0006[a-j]+\u0006|\u0007/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  return plain || val;
}

export function resolveDebugTokenRanges(
  highlighted: string,
  code: string,
  debugTokens: HighlightDebugToken[],
): void {
  let highlightIdx = 0;
  let codeIdx = 0;

  const advanceHighlight = () => {
    if (highlightIdx >= highlighted.length) return;

    if (highlighted.startsWith('&amp;', highlightIdx)) {
      highlightIdx += 5;
      codeIdx += 1;
      return;
    }
    if (
      highlighted.startsWith('&lt;', highlightIdx) ||
      highlighted.startsWith('&gt;', highlightIdx)
    ) {
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
}
