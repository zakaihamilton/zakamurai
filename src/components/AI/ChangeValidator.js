/** Shared safety checks for AI-proposed workspace changes. */
export function validateProjectPath(path) {
  if (typeof path !== 'string' || !path.trim()) return 'A file path is required.';
  if (path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(path)) {
    return `Path must be project-relative: ${path}`;
  }
  if (path.includes('\\') || path.split('/').some((part) => part === '..' || !part)) {
    return `Unsafe project path: ${path}`;
  }
  return null;
}

/**
 * Returns structured accepted/rejected operations so callers can preserve the
 * staged review flow while explaining why unsafe proposals were ignored.
 */
export function validateAIChanges(changes) {
  if (!Array.isArray(changes)) return { accepted: [], rejected: ['Changes must be an array.'] };
  const seen = new Set();
  const accepted = [];
  const rejected = [];
  for (const change of changes) {
    const path = change?.path ?? change?.filePath;
    const pathError = validateProjectPath(path);
    if (pathError) {
      rejected.push(pathError);
      continue;
    }
    if (seen.has(path)) {
      rejected.push(`Conflicting operations target ${path}.`);
      continue;
    }
    if (
      typeof change.content !== 'string' &&
      typeof change.after !== 'string' &&
      change.after !== undefined
    ) {
      rejected.push(`Invalid change content for ${path}.`);
      continue;
    }
    seen.add(path);
    accepted.push(change);
  }
  return { accepted, rejected };
}
