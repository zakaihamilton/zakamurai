import type { HighlightDebugToken, HighlightTokenRange } from '@/components/App/Views/EditorArea/types';
import type {
  ConciseTokenReport,
  TokenBreakdownReport,
  TokenBreakdownTab,
} from '@/components/App/Views/TokenBreakdown/token-breakdown-types';

export function makeHighlightTokenRange(
  overrides: Partial<HighlightTokenRange> = {},
): HighlightTokenRange {
  return {
    start: 0,
    end: 1,
    startPosition: { line: 0, column: 0 },
    endPosition: { line: 0, column: 1 },
    ...overrides,
  };
}

export function makeHighlightDebugToken(
  overrides: Partial<HighlightDebugToken> = {},
): HighlightDebugToken {
  return {
    index: 0,
    type: 'hlKw',
    className: 'hlKw',
    value: 'const',
    escapedValue: 'const',
    range: null,
    ...overrides,
  };
}

export function makeTokenBreakdownTab(
  overrides: Partial<TokenBreakdownTab> = {},
): TokenBreakdownTab {
  return {
    id: 'token-breakdown:src/test.js',
    label: 'test.js',
    type: 'token-breakdown',
    sourceFilePath: 'src/test.js',
    collapsedFoldIds: [],
    ...overrides,
  };
}

export function makeConciseTokenReport(
  overrides: Partial<ConciseTokenReport> = {},
): ConciseTokenReport {
  return {
    filePath: 'src/App.js',
    languageMode: 'javascript',
    lineCount: 1,
    tokens: [],
    ...overrides,
  };
}

export function makeTokenBreakdownReport(
  overrides: Partial<TokenBreakdownReport> = {},
): TokenBreakdownReport {
  return {
    filePath: 'src/App.js',
    languageMode: 'javascript',
    sourceLength: 100,
    lineCount: 10,
    maxHighlightChars: 10000,
    cacheable: true,
    largeFileFallback: false,
    selectedLines: [],
    diffs: [],
    suggestion: null,
    navigationLinksEnabled: true,
    navigationTargets: [],
    search: {
      enabled: false,
      query: '',
      activeMatchIndex: 0,
      matchCount: 0,
    },
    tokens: [],
    foldLabel: 'folds',
    collapsedFoldIds: [],
    folds: [],
    analysisDeferred: false,
    ...overrides,
  };
}
