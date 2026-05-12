/**
 * Tries to find the best existing file path that matches the provided path.
 */
export function resolveFilePath(providedPath, existingPaths) {
  if (!existingPaths || existingPaths.length === 0) return providedPath;
  if (existingPaths.includes(providedPath)) return providedPath;

  // Normalize providedPath
  const normalized = providedPath.replace(/^\.\//, '').replace(/\/+/g, '/');
  if (existingPaths.includes(normalized)) return normalized;

  const providedSegments = normalized.split('/').filter(Boolean);
  const fileName = providedSegments[providedSegments.length - 1];

  // 1. Try exact filename match if unique
  const filenameMatches = existingPaths.filter((p) => p.endsWith(`/${fileName}`) || p === fileName);
  if (filenameMatches.length === 1) return filenameMatches[0];

  // 2. Try longest suffix match
  let bestMatch = providedPath;
  let maxSuffixLength = 0;
  for (const existing of existingPaths) {
    const existingSegments = existing.split('/').filter(Boolean);
    let commonSuffixLength = 0;
    const minLen = Math.min(providedSegments.length, existingSegments.length);
    for (let i = 1; i <= minLen; i++) {
      if (
        providedSegments[providedSegments.length - i] ===
        existingSegments[existingSegments.length - i]
      ) {
        commonSuffixLength++;
      } else {
        break;
      }
    }
    if (commonSuffixLength > maxSuffixLength) {
      maxSuffixLength = commonSuffixLength;
      bestMatch = existing;
    }
  }

  // If we found a match that covers at least the filename, use it
  if (maxSuffixLength >= 1) return bestMatch;

  return providedPath;
}
