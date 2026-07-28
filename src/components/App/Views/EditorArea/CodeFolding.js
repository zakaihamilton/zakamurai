import { useCallback, useMemo } from 'react';
import { getCssBlockFolds, isCssPath } from './CssFolding';
import { getFoldStarts, getVisibleFoldedContent } from './Folding';
import { getJavaScriptBlockFolds, isJavaScriptPath } from './JavaScriptFolding';
import { getJsonObjectFolds, isJsonPath } from './JsonFolding';
import { shouldDeferEditorAnalysis } from './largeFile';

export default function useCodeFolding({
  filePath,
  localContent,
  collapsedFolds,
  setCollapsedFolds,
}) {
  const analysisDeferred = shouldDeferEditorAnalysis(localContent);
  const folds = useMemo(() => {
    if (analysisDeferred) return [];
    if (isJsonPath(filePath)) return getJsonObjectFolds(localContent, filePath);
    if (isCssPath(filePath)) return getCssBlockFolds(localContent, filePath);
    return getJavaScriptBlockFolds(localContent, filePath);
  }, [analysisDeferred, localContent, filePath]);

  const foldStarts = useMemo(() => getFoldStarts(folds), [folds]);
  const collapsedFoldIds = collapsedFolds[filePath] || [];

  const visibleFoldedContent = useMemo(
    () =>
      analysisDeferred
        ? { content: localContent, lineItems: null, hasCollapsedFolds: false }
        : getVisibleFoldedContent(localContent, folds, collapsedFoldIds),
    [analysisDeferred, localContent, folds, collapsedFoldIds],
  );

  const toggleFold = useCallback(
    (foldId) => {
      setCollapsedFolds((current = {}) => {
        const currentIds = current[filePath] || [];
        const nextIds = currentIds.includes(foldId)
          ? currentIds.filter((id) => id !== foldId)
          : [...currentIds, foldId];

        return {
          ...current,
          [filePath]: nextIds,
        };
      });
    },
    [filePath, setCollapsedFolds],
  );

  const foldLabel = useMemo(() => {
    if (isJsonPath(filePath)) return 'JSON object';
    if (isCssPath(filePath)) return 'CSS block';
    if (isJavaScriptPath(filePath)) return 'code block';
    return 'fold';
  }, [filePath]);

  return {
    foldStarts,
    collapsedFoldIds,
    visibleFoldedContent,
    toggleFold,
    foldLabel,
    analysisDeferred,
  };
}
