export type AiChange = {
  path?: unknown;
  filePath?: unknown;
  content?: unknown;
  after?: unknown;
};

/** Project-relative paths only: no absolute paths, traversal, or Windows separators. */
export function isProjectRelativePath(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    Boolean(path.trim()) &&
    !path.startsWith('/') &&
    !path.startsWith('\\') &&
    !/^[A-Za-z]:[\\/]/.test(path) &&
    !path.includes('\\') &&
    !path.split('/').some((part) => part === '..' || !part)
  );
}

export function hasValidAiChangeContent(change: AiChange): boolean {
  return (
    typeof change.content === 'string' ||
    typeof change.after === 'string' ||
    change.after === undefined
  );
}
