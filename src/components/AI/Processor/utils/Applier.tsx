import type { ProcessingResult } from '@/components/AI/types';
import { applyMarkerReplacement, applyTargetedReplacement, computeDiff } from './DiffEngine';
import { applyFuzzyReplacement, applyHeuristicInsertion } from './FuzzyMatcher';
import { applySearchReplace } from './SearchReplaceParser';

export {
  applySearchReplace,
  applyFuzzyReplacement,
  applyHeuristicInsertion,
  computeDiff,
  applyTargetedReplacement,
  applyMarkerReplacement,
};

/**
 * Decides how to apply the update (search/replace, targeted replacement, or full rewrite).
 *
 * @param {string} originalContent
 * @param {string} newContent
 * @param {number[]} selectedLines
 * @returns {import('../Main').ProcessingResult}
 */
export function applyFileUpdate(
  originalContent: string,
  newContent: string,
  selectedLines: number[] = [],
): ProcessingResult {
  if (newContent.includes('<<<<<<< SEARCH')) {
    const srResult = applySearchReplace(originalContent, newContent, selectedLines);
    if (srResult.diffs.length > 0) {
      return srResult;
    }
    const fuzzyFallback = applyFuzzyReplacement(originalContent, newContent);
    if (fuzzyFallback.diffs.length > 0) {
      return fuzzyFallback;
    }
    return {
      ...srResult,
      failed: true,
      reason: 'SEARCH block did not match original file content.',
    };
  }

  const markerPattern =
    /\s*(?:\/\/|\/\*|\{\/\*|<!--)\s*(?:<<<)?\s*NEW LINE\s*(?:>>>)?\s*(?:\*\/|\*\/\}|-->)\s*/i;
  if (markerPattern.test(newContent)) {
    return applyMarkerReplacement(originalContent, newContent, selectedLines);
  }

  // If it's a snippet (shorter than original) and we have no markers,
  // try to find where it fits or use selected lines.
  const isSnippet = newContent.length < originalContent.length * 0.8;

  if (isSnippet) {
    if (selectedLines.length > 0) {
      return applyTargetedReplacement(originalContent, newContent, selectedLines);
    }
    // Try fuzzy match
    const fuzzy = applyFuzzyReplacement(originalContent, newContent);
    if (fuzzy.diffs.length > 0) return fuzzy;

    // Try heuristic insertion as a last resort for single-line additions
    const heuristic = applyHeuristicInsertion(originalContent, newContent);
    if (heuristic) return heuristic;

    // If it's a snippet but no match found, don't replace the whole file.
    return { content: originalContent, diffs: [] };
  }

  return computeDiff(originalContent, newContent, selectedLines);
}
