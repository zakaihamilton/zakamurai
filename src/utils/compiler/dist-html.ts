import type { EsbuildOutputFile, PackageJson, VfsLike } from './types';

export function removeTree(vfs: VfsLike, path: string): void {
  if (!vfs.existsSync(path)) return;
  for (const name of vfs.readdirSync(path)) {
    const child = `${path}/${name}`;
    try {
      removeTree(vfs, child);
    } catch (_) {
      vfs.unlinkSync?.(child);
    }
  }
  try {
    vfs.rmdirSync?.(path);
  } catch (_) {
    vfs.unlinkSync?.(path);
  }
}

export function copyPublicFiles(vfs: VfsLike, from = '/public', to = '/dist'): string[] {
  if (!vfs.existsSync(from)) return [];
  const copied: string[] = [];
  for (const name of vfs.readdirSync(from)) {
    const source = `${from}/${name}`;
    const destination = `${to}/${name}`;
    try {
      const nested = copyPublicFiles(vfs, source, destination);
      copied.push(...nested);
    } catch (_) {
      vfs.writeFileSync(destination, vfs.readFileSync(source));
      copied.push(destination.replace('/dist/', ''));
    }
  }
  return copied;
}

function defaultHtml(packageName: string | undefined, entryPath: string): string {
  return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${packageName || 'Zakamurai App'}</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="${entryPath}"></script>\n</body>\n</html>`;
}

export function createHtml(
  vfs: VfsLike,
  packageJson: PackageJson,
  entryPath: string,
  outputFiles: EsbuildOutputFile[],
): string {
  const source = vfs.existsSync('/index.html')
    ? vfs.readFileSync('/index.html', 'utf8')
    : defaultHtml(packageJson.name, entryPath);
  const js = outputFiles.find((file) => file.path.endsWith('.js'));
  const css = outputFiles.find((file) => file.path.endsWith('.css'));
  // Preview documents are relocated into a session-specific URL by PreviewHost.
  // Keep build assets relative to dist/index.html so they remain in that preview
  // session instead of escaping to the IDE origin via an absolute /dist URL.
  const assetUrl = (path: string) => path.replace(/^\/dist\//, '');
  const script = js ? `<script type="module" src="${assetUrl(js.path)}"></script>` : '';
  const style = css ? `<link rel="stylesheet" href="${assetUrl(css.path)}">` : '';
  const escapedEntry = entryPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sourceScript = new RegExp(
    `<script\\b(?=[^>]*\\btype=["']module["'])[^>]*\\bsrc=["'](?:/?${escapedEntry.slice(1)}|${escapedEntry})["'][^>]*>\\s*<\\/script>\\s*`,
    'i',
  );
  const withoutSourceScript = source.replace(sourceScript, '');
  const withStyle = /<\/head>/i.test(withoutSourceScript)
    ? withoutSourceScript.replace(/<\/head>/i, `${style}\n</head>`)
    : `${style}\n${withoutSourceScript}`;
  return /<\/body>/i.test(withStyle)
    ? withStyle.replace(/<\/body>/i, `${script}\n</body>`)
    : `${withStyle}\n${script}`;
}
