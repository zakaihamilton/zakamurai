import type { ProcessingResult } from '@/components/AI/types';

/**
 * Tries to find a block in the original content that matches the snippet's
 * content and replaces it. Uses an anchor-based matching system to find the best range.
 */
export function applyFuzzyReplacement(original: string, snippet: string): ProcessingResult {
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

  // Minimum 1 line match for short snippets, 2 for longer ones.
  // This allows for "Existing Line + New Line" additions to work.
  const threshold = Math.max(1, Math.min(2, snippetLines.length - 1));
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

/**
 * Last-resort heuristic to insert a single-line snippet into a list or repeating structure.
 * Looks for lines with the same prefix and suffix as the snippet.
 */
export function applyHeuristicInsertion(
  original: string,
  snippet: string,
): ProcessingResult | null {
  const snippetLines = snippet.split('\n').filter((l) => l.trim() !== '');
  if (snippetLines.length !== 1) return null;

  const line = snippetLines[0].trim();
  if (line.length < 10) return null;

  const originalLines = original.split('\n');

  // Signature: first 15 and last 5 characters
  const prefix = line.substring(0, 15);
  const suffix = line.substring(Math.max(0, line.length - 5));

  let lastMatchIdx = -1;
  let matchCount = 0;
  for (let i = 0; i < originalLines.length; i++) {
    const trimmed = originalLines[i].trim();
    if (trimmed.startsWith(prefix) && trimmed.endsWith(suffix) && trimmed !== line) {
      lastMatchIdx = i;
      matchCount++;
    }
  }

  // If we found at least 2 similar items, it's likely a list
  if (matchCount >= 2 && lastMatchIdx !== -1) {
    const resultLines = [...originalLines];
    const indent = originalLines[lastMatchIdx]?.match(/^[ \t]*/)?.[0] ?? '';
    resultLines.splice(lastMatchIdx + 1, 0, indent + line);

    const newContent = resultLines.join('\n');
    let offset = 0;
    for (let i = 0; i <= lastMatchIdx; i++) offset += originalLines[i].length + 1;

    return {
      content: newContent,
      diffs: [
        {
          start: offset,
          end: offset + indent.length + line.length + 1,
          type: 'replacement',
          original: '',
        },
      ],
    };
  }

  return null;
}
