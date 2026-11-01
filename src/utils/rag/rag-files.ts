import { shouldSkipPath } from '@/utils/workspace/index-controller';

export type RagWorkspaceFilterOptions = {
  include?: string[];
  exclude?: string[];
  maxFileBytes?: number;
};

export type RagWorkspaceSelection = {
  files: Record<string, string>;
  skippedFileCount: number;
};

const DEFAULT_MAX_FILE_BYTES = 512 * 1024;

export function selectRagWorkspaceFiles(
  files: Record<string, string> = {},
  options: RagWorkspaceFilterOptions = {},
): Record<string, string> {
  return selectRagWorkspaceFilesWithSummary(files, options).files;
}

export function selectRagWorkspaceFilesWithSummary(
  files: Record<string, string> = {},
  options: RagWorkspaceFilterOptions = {},
): RagWorkspaceSelection {
  const include = options.include || [];
  const exclude = options.exclude || [];
  const maxFileBytes = Number.isFinite(options.maxFileBytes)
    ? Math.max(0, Number(options.maxFileBytes))
    : DEFAULT_MAX_FILE_BYTES;
  const encoder = new TextEncoder();
  const selected: Record<string, string> = {};
  let skippedFileCount = 0;

  for (const [path, content] of Object.entries(files).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (shouldSkipPath(path, { include, exclude })) continue;
    if (typeof content !== 'string' || encoder.encode(content).byteLength > maxFileBytes) {
      skippedFileCount += 1;
      continue;
    }
    selected[path] = content;
  }

  return { files: selected, skippedFileCount };
}
