import type { FileMap, FileSystemLike, SnapshotOptions } from '@/components/AI/types';

const SKIP = new Set(['node_modules', '.git', 'dist', '.next', '.npm']);

export async function collectWorkspaceFiles(
  fs: FileSystemLike | null | undefined,
  knownFiles: FileMap = {},
  options: SnapshotOptions = {},
): Promise<FileMap> {
  const files: FileMap = { ...knownFiles };
  if (fs?.mode !== 'local' || !fs.rootHandle) return files;

  const walk = async (handle: FileSystemDirectoryHandle, prefix = '', depth = 0): Promise<void> => {
    if (depth > 20) return;
    for await (const [name, entry] of handle.entries()) {
      if (SKIP.has(name)) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === 'directory') {
        await walk(entry as FileSystemDirectoryHandle, path, depth + 1);
      } else if (entry.kind === 'file' && !(path in files)) {
        const file = await (entry as FileSystemFileHandle).getFile();
        if (file.size <= 500000) files[path] = await file.text();
        else
          options.onSkipped?.({ path, size: file.size, reason: 'file exceeds index size limit' });
      }
    }
  };
  await walk(fs.rootHandle);
  return files;
}
