import type { Diff, ProcessingResult } from '@/components/AI/types';

/**
 * Computes multiple granular diff ranges and filters them by selectedLines if provided.
 */
export function computeDiff(
  original: string,
  updated: string,
  selectedLines: number[] = [],
): ProcessingResult {
  if (original === updated) return { content: updated, diffs: [] };

  const originalLines = original.split('\n');
  const updatedLines = updated.split('\n');
  const allDiffs = [];

  let i = 0; // index in originalLines
  let j = 0; // index in updatedLines

  while (i < originalLines.length || j < updatedLines.length) {
    if (
      i < originalLines.length &&
      j < updatedLines.length &&
      originalLines[i] === updatedLines[j]
    ) {
      i++;
      j++;
    } else {
      const startI = i;
      const startJ = j;

      // Find resync point: next pair of matching lines
      let resyncI = originalLines.length;
      let resyncJ = updatedLines.length;
      let foundResync = false;

      // Lookahead up to 50 lines
      const lookahead = 50;
      for (let k = 0; k < lookahead; k++) {
        for (let l = 0; l < lookahead; l++) {
          if (k === 0 && l === 0) continue;
          if (
            i + k < originalLines.length &&
            j + l < updatedLines.length &&
            originalLines[i + k] === updatedLines[j + l]
          ) {
            resyncI = i + k;
            resyncJ = j + l;
            foundResync = true;
            break;
          }
        }
        if (foundResync) break;
      }

      allDiffs.push({
        origStart: startI,
        origEnd: resyncI,
        updStart: startJ,
        updEnd: resyncJ,
        original: originalLines.slice(startI, resyncI).join('\n'),
        updated: updatedLines.slice(startJ, resyncJ).join('\n'),
      });

      i = resyncI;
      j = resyncJ;
    }
  }

  if (selectedLines.length > 0) {
    const selectedRanges = selectedLines.map((l) => {
      let s = 0;
      for (let k = 0; k < l - 1; k++) s += (originalLines[k]?.length || 0) + 1;
      return { start: s, end: s + (originalLines[l - 1]?.length || 0) };
    });

    const allowedDiffs = allDiffs.filter((d) => {
      let startOffset = 0;
      for (let k = 0; k < d.origStart; k++) startOffset += (originalLines[k]?.length || 0) + 1;
      const endOffset = startOffset + d.original.length;

      return selectedRanges.some((r) => {
        return (
          (startOffset >= r.start && startOffset <= r.end) ||
          (endOffset >= r.start && endOffset <= r.end) ||
          (r.start >= startOffset && r.start <= endOffset)
        );
      });
    });

    if (allowedDiffs.length === 0) {
      return { content: original, diffs: [] };
    }

    // Reconstruct content with only allowed changes
    const finalContentLines = [...originalLines];
    const sortedAllowed = [...allowedDiffs].sort((a, b) => b.origStart - a.origStart);
    for (const d of sortedAllowed) {
      finalContentLines.splice(
        d.origStart,
        d.origEnd - d.origStart,
        ...updatedLines.slice(d.updStart, d.updEnd),
      );
    }
    const finalContent = finalContentLines.join('\n');
    // Recursive call to get correct offsets for the new content
    return computeDiff(original, finalContent, []);
  }

  const resultDiffs = allDiffs.map((d) => {
    let offset = 0;
    for (let k = 0; k < d.updStart; k++) offset += (updatedLines[k]?.length || 0) + 1;
    let origOffset = 0;
    for (let k = 0; k < d.origStart; k++) origOffset += (originalLines[k]?.length || 0) + 1;
    return {
      start: offset,
      end: offset + d.updated.length,
      origStart: origOffset,
      origEnd: origOffset + d.original.length,
      type: 'replacement',
      original: d.original,
      updated: d.updated,
    };
  });

  return {
    content: updated,
    diffs: resultDiffs,
  };
}

/**
 * Replaces specifically the selected lines with the updated snippet.
 */
export function applyTargetedReplacement(
  original: string,
  snippet: string,
  selectedLines: number[] = [],
): ProcessingResult {
  if (selectedLines.length === 0) return { content: original, diffs: [] };

  const originalLines = original.split('\n');
  const sortedLines = [...selectedLines].sort((a, b) => a - b);
  const minLine = sortedLines[0];
  const maxLine = sortedLines[sortedLines.length - 1];

  const startIdx = Math.max(0, minLine - 1);
  const endIdx = Math.min(originalLines.length - 1, maxLine - 1);

  const before = originalLines.slice(0, startIdx).join('\n');
  const after = originalLines.slice(endIdx + 1).join('\n');

  const beforeStr = before ? `${before}\n` : '';
  const afterStr = after ? `\n${after}` : '';

  const newContent = `${beforeStr}${snippet}${afterStr}`;

  const start = beforeStr.length;
  const end = start + snippet.length;

  const originalReplaced = originalLines.slice(startIdx, endIdx + 1).join('\n');

  return {
    content: newContent,
    diffs: [
      {
        start,
        end,
        type: 'replacement',
        original: originalReplaced,
      },
    ],
  };
}

/**
 * Applies changes based on NEW LINE markers.
 * Supports multiple NEW LINE marker variants (line, block, and JSX comments).
 */
export function applyMarkerReplacement(
  original: string,
  updated: string,
  selectedLines: number[] = [],
): ProcessingResult {
  const updatedLines = updated.split('\n');
  const originalLines = original.split('\n');
  const markerPattern =
    /\s*(?:\/\/|\/\*|\{\/\*|<!--)\s*(?:<<<)?\s*NEW LINE\s*(?:>>>)?\s*(?:\*\/|\*\/\}|-->)\s*/i;

  const changes = [];

  for (let i = 0; i < updatedLines.length; i++) {
    if (markerPattern.test(updatedLines[i])) {
      const newLineContent = updatedLines[i].replace(markerPattern, '').trimEnd();

      // Look for context around this line to find it in the original
      const cleanLine = (l: string) => l.replace(markerPattern, '').trimEnd();
      const contextBefore = updatedLines.slice(Math.max(0, i - 3), i).map(cleanLine);
      const contextAfter = updatedLines
        .slice(i + 1, Math.min(updatedLines.length, i + 4))
        .map(cleanLine);

      // Find best match in original
      let bestMatchIdx = -1;
      let maxScore = -1;

      // Heuristic: start searching near the same relative position
      const startSearch = Math.floor((i / updatedLines.length) * originalLines.length);

      for (let offset = 0; offset < originalLines.length; offset++) {
        // Search outwards from startSearch
        for (const sign of [1, -1]) {
          const j = startSearch + offset * sign;
          if (j < 0 || j >= originalLines.length) continue;
          if (sign === -1 && offset === 0) continue; // avoid double checking 0

          let score = 0;
          // Check context before
          for (let k = 1; k <= contextBefore.length; k++) {
            if (
              j - k >= 0 &&
              originalLines[j - k].trim() === contextBefore[contextBefore.length - k].trim()
            ) {
              score++;
            } else {
              break;
            }
          }
          // Check context after
          for (let k = 1; k <= contextAfter.length; k++) {
            if (
              j + k < originalLines.length &&
              originalLines[j + k].trim() === contextAfter[k - 1].trim()
            ) {
              score++;
            } else {
              break;
            }
          }

          if (score > maxScore) {
            maxScore = score;
            bestMatchIdx = j;
          }

          if (maxScore >= Math.min(2, contextBefore.length + contextAfter.length)) {
            break;
          }
        }
        if (maxScore >= Math.min(2, contextBefore.length + contextAfter.length)) {
          break;
        }
      }

      if (bestMatchIdx !== -1) {
        changes.push({ originalIdx: bestMatchIdx, content: newLineContent });
      }
    }
  }

  if (changes.length === 0) {
    // Strip markers and fallback to diff
    const cleanUpdated = updatedLines
      .map((line) => line.replace(markerPattern, '').trimEnd())
      .join('\n');
    return computeDiff(original, cleanUpdated, selectedLines);
  }

  // Apply changes
  const resultLines = [...originalLines];
  const diffs = [];

  // Sort changes by originalIdx descending to not mess up indices if we were adding/removing,
  // but here we just replace single lines.
  changes.sort((a, b) => b.originalIdx - a.originalIdx);

  for (const change of changes) {
    const oldLine = resultLines[change.originalIdx];

    // If the old line matches the context but is clearly different from the new line,
    // and the new line is intended to be "new", we might want to insert instead of replace.
    // However, for now we follow the existing "replace" behavior but ensure it's robust.
    resultLines[change.originalIdx] = change.content;

    // Compute char offset for diff (approximate)
    let offset = 0;
    for (let i = 0; i < change.originalIdx; i++) offset += resultLines[i].length + 1;

    diffs.push({
      start: offset,
      end: offset + change.content.length,
      type: 'replacement',
      original: oldLine,
    });
  }

  return { content: resultLines.join('\n'), diffs };
}
