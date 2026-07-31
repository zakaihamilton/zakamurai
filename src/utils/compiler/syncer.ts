/**
 * File synchronization logic for the compiler container.
 */

import type { AlmostnodeContainer, FolderTreeNode, LocalFsLike, OnLog } from './types';

type DirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

// The virtual container is intentionally shared between builds. Remember which
// project files we wrote so removing a file in the editor removes it there too.
const syncedFiles = new WeakMap<AlmostnodeContainer, Set<string>>();
const syncedContents = new WeakMap<AlmostnodeContainer, Map<string, string>>();

export async function syncFilesToContainer(
  container: AlmostnodeContainer,
  fs: LocalFsLike,
  folderTree: FolderTreeNode[],
  fileContents: Record<string, string>,
  onLog: OnLog,
): Promise<void> {
  onLog('Synchronizing files to virtual environment...');

  let syncCount = 0;
  const currentFiles = new Set<string>();
  const previousContents = syncedContents.get(container) || new Map<string, string>();
  const nextContents = new Map(previousContents);
  const syncFile = async (fullPath: string, contentPromise: () => Promise<string>) => {
    syncCount++;
    if (syncCount % 50 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const pathStr = String(fullPath);
    const vfsPath = pathStr.startsWith('/') ? pathStr : `/${pathStr}`;
    currentFiles.add(vfsPath);
    const inMemory = fileContents[pathStr];
    let content: string;
    if (inMemory !== undefined) {
      content = inMemory;
    } else {
      try {
        content = await contentPromise();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onLog(`Warning: Failed to read ${pathStr}: ${message}`);
        content = '';
      }
    }
    // The virtual container is long-lived. Rewriting unchanged files makes large
    // project builds needlessly expensive and invalidates tool caches.
    if (previousContents.get(vfsPath) !== content) {
      container.vfs.writeFileSync(vfsPath, content);
    }
    nextContents.set(vfsPath, content);
  };

  if (fs.mode === 'local' && fs.rootHandle) {
    let traverseCount = 0;
    const seenHandles = new Set<FileSystemHandle>();
    const traverse = async (handle: FileSystemDirectoryHandle, path = '', depth = 0) => {
      if (depth > 20 || seenHandles.has(handle)) return;
      seenHandles.add(handle);

      for await (const [name, entry] of (handle as DirectoryHandleWithEntries).entries()) {
        traverseCount++;
        if (traverseCount % 20 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        if (name === 'node_modules' || name === '.git' || name === 'dist' || name === '.npm')
          continue;
        const entryPath = path ? `${path}/${name}` : name;
        if (entry.kind === 'file') {
          await syncFile(entryPath, async () => {
            const file = await (entry as FileSystemFileHandle).getFile();
            return await file.text();
          });
        } else if (entry.kind === 'directory') {
          if (!container.vfs.existsSync(`/${entryPath}`)) {
            container.vfs.mkdirSync?.(`/${entryPath}`, { recursive: true });
          }
          await traverse(entry as FileSystemDirectoryHandle, entryPath, depth + 1);
        }
      }
    };
    await traverse(fs.rootHandle);
  } else {
    let nodeCount = 0;
    const traverseNodes = async (node: FolderTreeNode, path = '', depth = 0) => {
      if (depth > 20) return;
      if (
        node.name === 'node_modules' ||
        node.name === '.git' ||
        node.name === 'dist' ||
        node.name === '.npm'
      )
        return;

      nodeCount++;
      if (nodeCount % 50 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const fullPath = path ? `${path}/${node.name}` : node.name;
      if (node.isDir || node.type === 'folder') {
        if (!container.vfs.existsSync(`/${fullPath}`)) {
          container.vfs.mkdirSync?.(`/${fullPath}`, { recursive: true });
        }
        if (node.children) {
          for (const child of node.children) {
            await traverseNodes(child, fullPath, depth + 1);
          }
        }
      } else {
        await syncFile(fullPath, async () => {
          return node.content || '';
        });
      }
    };

    for (const node of folderTree) {
      await traverseNodes(node);
    }
  }

  // AI writes update the canonical in-memory buffers immediately, while the
  // sidebar tree or a local directory can lag by a render or disk flush.
  // Include any buffer that is not yet present in the traversed source so
  // validation and the following build use the same workspace.
  for (const [path, content] of Object.entries(fileContents)) {
    const vfsPath = path.startsWith('/') ? path : `/${path}`;
    if (currentFiles.has(vfsPath)) continue;
    const parentPath = vfsPath.slice(0, vfsPath.lastIndexOf('/'));
    if (parentPath && !container.vfs.existsSync(parentPath)) {
      container.vfs.mkdirSync?.(parentPath, { recursive: true });
    }
    await syncFile(path, async () => content);
  }

  const previousFiles = syncedFiles.get(container) || new Set<string>();
  for (const path of previousFiles) {
    if (currentFiles.has(path)) continue;
    try {
      container.vfs.unlinkSync?.(path);
      nextContents.delete(path);
      onLog(`Removed deleted file from virtual environment: ${path}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onLog(`Warning: Failed to remove deleted file ${path}: ${message}`);
    }
  }
  syncedFiles.set(container, currentFiles);
  syncedContents.set(container, nextContents);
  onLog('File synchronization complete.');
}
