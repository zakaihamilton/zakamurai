import { getCssBlockFolds, isCssPath } from '@/components/App/Views/EditorArea/CssFolding';
import {
  getJavaScriptBlockFolds,
  isJavaScriptPath,
} from '@/components/App/Views/EditorArea/JavaScriptFolding';
import { getJsonObjectFolds, isJsonPath } from '@/components/App/Views/EditorArea/JsonFolding';

const TOKEN_LABELS = {
  hlAttr: 'Attribute',
  hlComment: 'Comment',
  hlFunc: 'Function',
  hlJsonBool: 'JSON Literal',
  hlJsonKey: 'JSON Key',
  hlJsonPunc: 'JSON Punctuation',
  hlKw: 'Keyword',
  hlNum: 'Number',
  hlProp: 'Property',
  hlStr: 'String',
  hlTag: 'Tag',
  hlVal: 'Value',
};

export const getTokenLabel = (type = '') =>
  TOKEN_LABELS[type] || type.replace(/^hl/, '') || 'Token';

export const getFolds = (code, filePath) => {
  if (isJsonPath(filePath)) return getJsonObjectFolds(code, filePath);
  if (isCssPath(filePath)) return getCssBlockFolds(code, filePath);
  return getJavaScriptBlockFolds(code, filePath);
};

export const getFoldLabel = (filePath) => {
  if (isJsonPath(filePath)) return 'JSON object';
  if (isCssPath(filePath)) return 'CSS block';
  if (isJavaScriptPath(filePath)) return 'code block';
  return 'fold';
};

export const compareTokensBySourceOrder = (a, b) => {
  const aStart = a.range?.start ?? Number.POSITIVE_INFINITY;
  const bStart = b.range?.start ?? Number.POSITIVE_INFINITY;
  if (aStart !== bStart) return aStart - bStart;
  const aEnd = a.range?.end ?? 0;
  const bEnd = b.range?.end ?? 0;
  if (aEnd !== bEnd) return aEnd - bEnd;
  return a.index - b.index;
};

export const checkTokenReportMatch = (code, report) => {
  const tokens = [...report.tokens].sort((a, b) => (a.range?.start ?? 0) - (b.range?.start ?? 0));
  let reconstructed = '';
  let lastIdx = 0;
  const mismatches = [];

  for (const token of tokens) {
    const start = token.range?.start;
    const end = token.range?.end;
    const value = token.value;
    if (start === undefined || end === undefined) {
      mismatches.push({ token, reason: `Missing range for token "${value}"` });
      continue;
    }
    if (start > lastIdx) reconstructed += code.substring(lastIdx, start);
    else if (start < lastIdx) {
      mismatches.push({
        token,
        reason: `Overlap: Token starts at ${start}, previous ended at ${lastIdx}`,
      });
    }
    const originalValue = code.substring(start, end);
    if (originalValue !== value) {
      mismatches.push({
        token,
        reason: `Value mismatch: report has "${value}" but file has "${originalValue}"`,
      });
    }
    reconstructed += value;
    lastIdx = end;
  }

  if (lastIdx < code.length) reconstructed += code.substring(lastIdx);
  return {
    isMatch: reconstructed === code && mismatches.length === 0,
    mismatches,
    reconstructedLength: reconstructed.length,
    originalLength: code.length,
  };
};
