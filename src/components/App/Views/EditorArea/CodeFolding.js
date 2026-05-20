import { useMemo, useCallback } from 'react';
import { getFoldStarts, getVisibleFoldedContent } from './Folding';
import { getJavaScriptBlockFolds, isJavaScriptPath } from './JavaScriptFolding';
import { getCssBlockFolds, isCssPath } from './CssFolding';
import { getJsonObjectFolds, isJsonPath } from './JsonFolding';

export default function useCodeFolding({
  filePath,
  localContent,
  collapsedFolds,
  setCollapsedFolds,
}) {
  const folds = useMemo(() => {
    if (isJsonPath(filePath)) return getJsonObjectFolds(localContent, filePath);
    if (isCssPath(filePath)) return getCssBlockFolds(localContent, filePath);
    return getJavaScriptBlockFolds(localContent, filePath);
  }, [localContent, filePath]);

  const foldStarts = useMemo(() => getFoldStarts(folds), [folds]);
  const collapsedFoldIds = collapsedFolds[filePath] || [];

  const visibleFoldedContent = useMemo(
    () => getVisibleFoldedContent(localContent, folds, collapsedFoldIds),
    [localContent, folds, collapsedFoldIds],
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
  };
}
