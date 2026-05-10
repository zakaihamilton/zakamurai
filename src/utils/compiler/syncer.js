/**
 * File synchronization logic for the compiler container.
 */

export async function syncFilesToContainer(container, fs, folderTree, fileContents, onLog) {
  onLog('Synchronizing files to virtual environment...');

  let syncCount = 0;
  const syncFile = async (fullPath, contentPromise) => {
    syncCount++;
    if (syncCount % 50 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const pathStr = String(fullPath);
    const vfsPath = pathStr.startsWith('/') ? pathStr : `/${pathStr}`;
    const inMemory = fileContents[pathStr];
    let content;
    if (inMemory !== undefined) {
      content = inMemory;
    } else {
      try {
        content = await contentPromise();
      } catch (err) {
        onLog(`Warning: Failed to read ${pathStr}: ${err.message}`);
        content = '';
      }
    }
    container.vfs.writeFileSync(vfsPath, content);
  };

  if (fs.mode === 'local' && fs.rootHandle) {
    let traverseCount = 0;
    const seenHandles = new Set();
    const traverse = async (handle, path = '', depth = 0) => {
      if (depth > 20 || seenHandles.has(handle)) return;
      seenHandles.add(handle);

      for await (const [name, entry] of handle.entries()) {
        traverseCount++;
        if (traverseCount % 20 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        if (name === 'node_modules' || name === '.git' || name === 'dist' || name === '.npm')
          continue;
        const entryPath = path ? `${path}/${name}` : name;
        if (entry.kind === 'file') {
          await syncFile(entryPath, async () => {
            const file = await entry.getFile();
            return await file.text();
          });
        } else if (entry.kind === 'directory') {
          if (!container.vfs.existsSync(`/${entryPath}`)) {
            container.vfs.mkdirSync(`/${entryPath}`, { recursive: true });
          }
          await traverse(entry, entryPath, depth + 1);
        }
      }
    };
    await traverse(fs.rootHandle);
  } else {
    let nodeCount = 0;
    const traverseNodes = async (node, path = '', depth = 0) => {
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
          container.vfs.mkdirSync(`/${fullPath}`, { recursive: true });
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
  onLog('File synchronization complete.');
}
