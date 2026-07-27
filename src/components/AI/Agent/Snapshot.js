const SKIP = new Set(['node_modules', '.git', 'dist', '.next', '.npm']);

export async function collectWorkspaceFiles(fs, knownFiles = {}, options = {}) {
  const files = { ...knownFiles };
  if (fs?.mode !== 'local' || !fs.rootHandle) return files;

  const walk = async (handle, prefix = '', depth = 0) => {
    if (depth > 20) return;
    for await (const [name, entry] of handle.entries()) {
      if (SKIP.has(name)) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === 'directory') {
        await walk(entry, path, depth + 1);
      } else if (!(path in files)) {
        const file = await entry.getFile();
        if (file.size <= 500000) files[path] = await file.text();
        else
          options.onSkipped?.({ path, size: file.size, reason: 'file exceeds index size limit' });
      }
    }
  };
  await walk(fs.rootHandle);
  return files;
}
