/**
 * File synchronization logic for the compiler container.
 */

export async function syncFilesToContainer(container, fs, folderTree, fileContents, onLog) {
  onLog('Synchronizing files to virtual environment...');

  const syncFile = async (fullPath, contentPromise) => {
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
    const traverse = async (handle, path = '') => {
      for await (const [name, entry] of handle.entries()) {
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
          await traverse(entry, entryPath);
        }
      }
    };
    await traverse(fs.rootHandle);
  } else {
    const syncNode = async (node, path = '') => {
      const fullPath = path ? `${path}/${node.name}` : node.name;
      if (node.isDir || node.type === 'folder') {
        if (!container.vfs.existsSync(`/${fullPath}`)) {
          container.vfs.mkdirSync(`/${fullPath}`, { recursive: true });
        }
        if (node.children) {
          for (const child of node.children) {
            await syncNode(child, fullPath);
          }
        }
      } else {
        await syncFile(fullPath, async () => {
          return node.content || '';
        });
      }
    };

    for (const node of folderTree) {
      await syncNode(node);
    }
  }
  onLog('File synchronization complete.');
}
