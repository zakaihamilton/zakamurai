import { shouldSkipPath } from '@/utils/workspace/index-controller';

export type RagWorkspaceFilterOptions = {
  exclude?: string[];
  maxFileBytes?: number;
};

const DEFAULT_MAX_FILE_BYTES = 512 * 1024;

export function selectRagWorkspaceFiles(
  files: Record<string, string> = {},
  options: RagWorkspaceFilterOptions = {},
): Record<string, string> {
  const exclude = options.exclude || [];
  const maxFileBytes = Number.isFinite(options.maxFileBytes)
    ? Math.max(0, Number(options.maxFileBytes))
    : DEFAULT_MAX_FILE_BYTES;
  const encoder = new TextEncoder();
  const selected: Record<string, string> = {};

  for (const [path, content] of Object.entries(files).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (typeof content !== 'string' || shouldSkipPath(path, { exclude })) continue;
    if (encoder.encode(content).byteLength > maxFileBytes) continue;
    selected[path] = content;
  }

  return selected;
}
