import type { FileMap, FileSystemLike, SnapshotOptions } from '@/components/AI/types';

const SKIP = new Set(['node_modules', '.git', 'dist', '.next', '.npm']);

export async function collectWorkspaceFiles(
  fs: FileSystemLike | null | undefined,
  knownFiles: FileMap = {},
  options: SnapshotOptions = {},
): Promise<FileMap> {
  if (fs?.mode !== 'local' || !fs.rootHandle) return { ...knownFiles };
  const files: FileMap = {};
  const deletedPaths = new Set((fs.deletedPaths || []).map((path) => path.replace(/^\/+/, '')));
  const overlayPaths = new Set((fs.overlayPaths || []).map((path) => path.replace(/^\/+/, '')));

  const walk = async (handle: FileSystemDirectoryHandle, prefix = '', depth = 0): Promise<void> => {
    if (depth > 20) return;
    for await (const [name, entry] of handle.entries()) {
      if (SKIP.has(name)) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (deletedPaths.has(path)) continue;
      if (entry.kind === 'directory') {
        await walk(entry as FileSystemDirectoryHandle, path, depth + 1);
      } else if (entry.kind === 'file') {
        if (overlayPaths.has(path) && Object.hasOwn(knownFiles, path)) {
          files[path] = knownFiles[path];
          continue;
        }
        try {
          const file = await (entry as FileSystemFileHandle).getFile();
          if (file.size <= 500000) files[path] = await file.text();
          else
            options.onSkipped?.({ path, size: file.size, reason: 'file exceeds index size limit' });
        } catch (error) {
          options.onSkipped?.({
            path,
            reason: `file could not be read: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    }
  };
  await walk(fs.rootHandle);
  for (const path of overlayPaths) {
    if (deletedPaths.has(path) || !Object.hasOwn(knownFiles, path)) continue;
    files[path] = knownFiles[path];
  }
  return files;
}
