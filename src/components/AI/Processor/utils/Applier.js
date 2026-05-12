/**
 * Decides how to apply the update (search/replace, targeted replacement, or full rewrite).
 *
 * @param {string} originalContent
 * @param {string} newContent
 * @param {number[]} selectedLines
 * @returns {import('../Main').ProcessingResult}
 */
export function applyFileUpdate(originalContent, newContent, selectedLines = []) {
  if (newContent.includes('<<<<<<< SEARCH')) {
    return applySearchReplace(originalContent, newContent, selectedLines);
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

    // If it's a snippet but no match found, don't replace the whole file.
    return { content: originalContent, diffs: [] };
  }

  return computeDiff(originalContent, newContent, selectedLines);
}

/**
 * Tries to find a block in the original content that matches the snippet's
 * content and replaces it. Uses an anchor-based matching system to find the best range.
 */
export function applyFuzzyReplacement(original, snippet) {
  const snippetLines = snippet.split('\n').filter((l) => l.trim() !== '');
  if (snippetLines.length < 1) return { content: original, diffs: [] };

  const originalLines = original.split('\n');

  let bestMatchIdx = -1;
  let bestRangeEnd = -1;
  let maxMatchedLines = -1;

  // Search for anchors: lines in the snippet that match lines in the original
  for (let i = 0; i < originalLines.length; i++) {
    const snippetIdx = snippetLines.findIndex((sl) => sl.trim() === originalLines[i].trim());
    if (snippetIdx === -1) continue;

    // Anchor found at originalLines[i] matches snippetLines[snippetIdx]
    let matchedLines = 1;
    let firstOriginalMatch = i;
    let lastOriginalMatch = i;

    // Search forward from the anchor
    let k = i + 1;
    for (let j = snippetIdx + 1; j < snippetLines.length; j++) {
      for (let lookahead = 0; lookahead < 15; lookahead++) {
        if (
          k + lookahead < originalLines.length &&
          originalLines[k + lookahead].trim() === snippetLines[j].trim()
        ) {
          matchedLines++;
          lastOriginalMatch = k + lookahead;
          k = lastOriginalMatch + 1;
          break;
        }
      }
    }

    // Search backward from the anchor
    let kBack = i - 1;
    for (let j = snippetIdx - 1; j >= 0; j--) {
      for (let lookahead = 0; lookahead < 15; lookahead++) {
        if (
          kBack - lookahead >= 0 &&
          originalLines[kBack - lookahead].trim() === snippetLines[j].trim()
        ) {
          matchedLines++;
          firstOriginalMatch = kBack - lookahead;
          kBack = firstOriginalMatch - 1;
          break;
        }
      }
    }

    if (matchedLines > maxMatchedLines) {
      maxMatchedLines = matchedLines;
      bestMatchIdx = firstOriginalMatch;
      bestRangeEnd = lastOriginalMatch;
    }

    if (maxMatchedLines >= snippetLines.length) break;
  }

  // Minimum 2 line match or full match if snippet is 1 line
  const threshold = Math.min(2, snippetLines.length);
  if (maxMatchedLines >= threshold && bestRangeEnd - bestMatchIdx < 100) {
    const before = originalLines.slice(0, bestMatchIdx).join('\n');
    const after = originalLines.slice(bestRangeEnd + 1).join('\n');
    const beforeStr = before ? `${before}\n` : '';
    const afterStr = after ? `\n${after}` : '';
    const newContent = `${beforeStr}${snippet}${afterStr}`;

    let offset = 0;
    for (let i = 0; i < bestMatchIdx; i++) offset += originalLines[i].length + 1;

    return {
      content: newContent,
      diffs: [
        {
          start: offset,
          end: offset + snippet.length,
          type: 'replacement',
          original: originalLines.slice(bestMatchIdx, bestRangeEnd + 1).join('\n'),
        },
      ],
    };
  }

  return { content: original, diffs: [] };
}

function isPlaceholderSearch(search) {
  const normalized = search.trim().toLowerCase();
  return (
    normalized === '[exact existing lines]' ||
    normalized === '[exact code to find]' ||
    normalized === '[exact lines to change]' ||
    normalized === '[old]' ||
    normalized === '...'
  );
}

function cleanGeneratedReplacement(replace) {
  const lines = replace.split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim() !== '');
  const uniqueLineCount = new Set(nonEmptyLines.map((line) => line.trim())).size;
  const hasHeavyDuplication =
    nonEmptyLines.length >= 8 && uniqueLineCount / nonEmptyLines.length <= 0.75;

  if (!hasHeavyDuplication) {
    return replace;
  }

  const seen = new Set();
  return lines
    .filter((line) => {
      const key = line.trim();
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n');
}

/**
 * Applies search/replace blocks and returns the new content and the ranges that changed.
 * Only applies changes if they overlap with selectedLines (if provided).
 */
export function applySearchReplace(original, blocks, selectedLines = []) {
  const blockRegex =
    /<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> REPLACE/g;
  let result = original;
  const diffs = [];
  let match = blockRegex.exec(blocks);

  // Convert selected line numbers to character ranges for easier overlap checking
  const lines = original.split('\n');
  const selectedRanges = selectedLines.map((l) => {
    let start = 0;
    for (let i = 0; i < l - 1; i++) start += lines[i].length + 1;
    return { start, end: start + (lines[l - 1]?.length || 0) };
  });

  while (match !== null) {
    const search = match[1];
    const replace = cleanGeneratedReplacement(match[2]);

    if (search || replace) {
      if (isPlaceholderSearch(search)) {
        if (selectedLines.length > 0 && replace.trim()) {
          return applyTargetedReplacement(original, replace.trim(), selectedLines);
        }

        match = blockRegex.exec(blocks);
        continue;
      }

      const foundIndex = original.indexOf(search);
      const searchEnd = foundIndex + (search ? search.length : 0);

      const isAllowed =
        selectedLines.length === 0 ||
        selectedRanges.some((r) => {
          return (
            (foundIndex >= r.start && foundIndex <= r.end) ||
            (searchEnd >= r.start && searchEnd <= r.end) ||
            (r.start >= foundIndex && r.start <= searchEnd)
          );
        });

      if (isAllowed) {
        if (search === '') {
          const start = result.length;
          result += replace;
          diffs.push({
            start,
            end: result.length,
            type: 'replacement',
            original: '',
          });
        } else if (foundIndex !== -1) {
          const currentIdx = result.indexOf(search);
          if (currentIdx !== -1) {
            result =
              result.substring(0, currentIdx) +
              replace +
              result.substring(currentIdx + search.length);
            diffs.push({
              start: currentIdx,
              end: currentIdx + replace.length,
              type: 'replacement',
              original: search,
            });
          }
        }
      }
    }
    match = blockRegex.exec(blocks);
  }
  return { content: result, diffs };
}

/**
 * Computes a single range diff and filters it by selectedLines if provided.
 */
export function computeDiff(original, updated, selectedLines = []) {
  if (original === updated) return { content: original, diffs: [] };

  let start = 0;
  while (start < original.length && start < updated.length && original[start] === updated[start]) {
    start++;
  }

  let endOrig = original.length;
  let endUpd = updated.length;
  while (endOrig > start && endUpd > start && original[endOrig - 1] === updated[endUpd - 1]) {
    endOrig--;
    endUpd--;
  }

  if (selectedLines.length > 0) {
    const lines = original.split('\n');
    const selectedRanges = selectedLines.map((l) => {
      let s = 0;
      for (let i = 0; i < l - 1; i++) s += lines[i].length + 1;
      return { start: s, end: s + (lines[l - 1]?.length || 0) };
    });

    const isOverlap = selectedRanges.some((r) => {
      return (
        (start >= r.start && start <= r.end) ||
        (endUpd >= r.start && endUpd <= r.end) ||
        (r.start >= start && r.start <= endUpd)
      );
    });

    if (!isOverlap) {
      return { content: original, diffs: [] };
    }
  }

  return {
    content: updated,
    diffs: [
      {
        start,
        end: endUpd,
        type: 'replacement',
        original: original.substring(start, endOrig),
      },
    ],
  };
}

/**
 * Replaces specifically the selected lines with the updated snippet.
 */
export function applyTargetedReplacement(original, snippet, selectedLines = []) {
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
export function applyMarkerReplacement(original, updated, selectedLines = []) {
  const updatedLines = updated.split('\n');
  const originalLines = original.split('\n');
  const markerPattern =
    /\s*(?:\/\/|\/\*|\{\/\*|<!--)\s*(?:<<<)?\s*NEW LINE\s*(?:>>>)?\s*(?:\*\/|\*\/\}|-->)\s*/i;

  const changes = [];

  for (let i = 0; i < updatedLines.length; i++) {
    if (markerPattern.test(updatedLines[i])) {
      const newLineContent = updatedLines[i].replace(markerPattern, '').trimEnd();

      // Look for context around this line to find it in the original
      const cleanLine = (l) => l.replace(markerPattern, '').trimEnd();
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
