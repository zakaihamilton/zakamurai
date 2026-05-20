import { applyTargetedReplacement } from './DiffEngine';

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
