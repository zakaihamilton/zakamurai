export function compilerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Unknown compilation error');
}
