import type { PackageJson, VfsLike } from './types';

const SOURCE_EXTENSIONS = ['', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json', '.css'];
const ASSET_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
  '.woff',
  '.woff2',
  '.eot',
  '.ttf',
]);

export function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index > 0 ? path.slice(0, index) : '/';
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function extension(path: string): string {
  const name = basename(path);
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index).toLowerCase();
}

export function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return `/${parts.join('/')}`;
}

function isDirectory(vfs: VfsLike, path: string): boolean {
  try {
    vfs.readdirSync(path);
    return true;
  } catch {
    return false;
  }
}

export function resolveFile(vfs: VfsLike, candidate: string): string | null {
  for (const suffix of SOURCE_EXTENSIONS) {
    if (suffix === '' && isDirectory(vfs, candidate)) continue;
    const path = `${candidate}${suffix}`;
    if (vfs.existsSync(path)) return path;
  }
  for (const suffix of SOURCE_EXTENSIONS.slice(1)) {
    const indexPath = `${candidate}/index${suffix}`;
    if (vfs.existsSync(indexPath)) return indexPath;
  }
  const base = basename(candidate);
  if (base) {
    for (const suffix of SOURCE_EXTENSIONS.slice(1)) {
      const namedPath = `${candidate}/${base}${suffix}`;
      if (vfs.existsSync(namedPath)) return namedPath;
    }
  }
  return null;
}

function packageParts(specifier: string): [string, string] {
  const parts = specifier.split('/');
  const count = specifier.startsWith('@') ? 2 : 1;
  return [parts.slice(0, count).join('/'), parts.slice(count).join('/')];
}

export function applyBrowserRemap(manifest: PackageJson | null, relativePath: string): string {
  if (!manifest?.browser || typeof manifest.browser !== 'object' || !relativePath) {
    return relativePath;
  }
  const browserMap = manifest.browser;
  const candidates = relativePath.startsWith('./')
    ? [relativePath, relativePath.slice(2)]
    : [`./${relativePath}`, relativePath];
  for (const key of candidates) {
    const remapped = browserMap[key];
    if (remapped === false) continue;
    if (typeof remapped === 'string' && remapped) return remapped;
  }
  return relativePath;
}

export function packageEntry(manifest: PackageJson): string {
  if (typeof manifest.browser === 'string' && manifest.browser) {
    return manifest.browser;
  }

  const entry =
    (typeof manifest.module === 'string' && manifest.module) ||
    (typeof manifest.main === 'string' && manifest.main) ||
    'index.js';

  return applyBrowserRemap(manifest, entry);
}

function packageRootFromDir(resolveDir: string): string | null {
  const match = String(resolveDir || '').match(/^\/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
  return match ? match[0] : null;
}

export function selectExport(target: unknown): string | null {
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) {
    for (const item of target) {
      const selected = selectExport(item);
      if (selected) return selected;
    }
    return null;
  }
  if (!target || typeof target !== 'object') return null;

  const record = target as Record<string, unknown>;
  for (const condition of ['browser', 'import', 'default']) {
    const selected = selectExport(record[condition]);
    if (selected) return selected;
  }
  return null;
}

export function exportTarget(exportsField: unknown, subpath: string): string | null {
  if (typeof exportsField === 'string' || Array.isArray(exportsField)) {
    return subpath ? null : selectExport(exportsField);
  }
  if (!exportsField || typeof exportsField !== 'object') return null;
  const field = exportsField as Record<string, unknown>;
  const key = subpath ? `./${subpath}` : '.';
  if (!subpath && Object.keys(field).every((entry) => !entry.startsWith('.'))) {
    return selectExport(field);
  }
  if (Object.hasOwn(field, key)) return selectExport(field[key]);

  for (const [pattern, target] of Object.entries(field)) {
    if (!pattern.includes('*')) continue;
    const [start, end] = pattern.split('*');
    if (!key.startsWith(start) || !key.endsWith(end)) continue;
    const replacement = key.slice(start.length, key.length - end.length);
    const selected = selectExport(target);
    if (selected) return selected.replaceAll('*', replacement);
  }
  return null;
}

function parseManifest(vfs: VfsLike, manifestPath: string, packageName: string): PackageJson {
  try {
    const parsed = JSON.parse(vfs.readFileSync(manifestPath, 'utf8')) as PackageJson;
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot read package '${packageName}': malformed ${manifestPath} (${message}).`,
    );
  }
}

export function resolvePackage(vfs: VfsLike, specifier: string): string {
  const [packageName, subpath] = packageParts(specifier);
  const root = `/node_modules/${packageName}`;
  if (!vfs.existsSync(root)) {
    throw new Error(`Package '${packageName}' is not installed (required by '${specifier}').`);
  }

  const manifestPath = `${root}/package.json`;
  if (!vfs.existsSync(manifestPath)) {
    const resolved = subpath ? resolveFile(vfs, `${root}/${subpath}`) : resolveFile(vfs, root);
    if (resolved) return resolved;
    throw new Error(`Package '${packageName}' has no package.json or resolvable entry point.`);
  }
  const manifest = parseManifest(vfs, manifestPath, packageName);
  const target = exportTarget(manifest.exports, subpath);
  if (manifest.exports !== undefined && !target) {
    throw new Error(
      `Package '${packageName}' does not provide '${subpath ? `./${subpath}` : '.'}' for browser imports.`,
    );
  }
  const candidate = target || (subpath ? subpath : packageEntry(manifest));
  const remapped = applyBrowserRemap(manifest, candidate);
  const resolved = resolveFile(vfs, normalizePath(`${root}/${remapped}`));
  if (resolved) return resolved;
  throw new Error(
    `Package '${packageName}' does not provide '${subpath ? `./${subpath}` : '.'}' for browser imports.`,
  );
}

export function resolveSpecifier(
  vfs: VfsLike,
  specifier: string,
  resolveDir: string,
): string | null {
  if (specifier.startsWith('/') || specifier.startsWith('.')) {
    if (specifier.startsWith('.')) {
      const pkgRoot = packageRootFromDir(resolveDir);
      if (pkgRoot) {
        const manifestPath = `${pkgRoot}/package.json`;
        if (vfs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(vfs.readFileSync(manifestPath, 'utf8')) as PackageJson;
            const remapped = applyBrowserRemap(manifest, specifier);
            if (remapped !== specifier) {
              const fromRoot = resolveFile(vfs, normalizePath(`${pkgRoot}/${remapped}`));
              if (fromRoot) return fromRoot;
            }
          } catch (_) {
            // Fall through to normal relative resolve.
          }
        }
      }
    }
    const candidate = normalizePath(
      specifier.startsWith('/') ? specifier : `${resolveDir}/${specifier}`,
    );
    return (
      resolveFile(vfs, candidate) ||
      (specifier.startsWith('/') ? resolveFile(vfs, `/public${candidate}`) : null)
    );
  }
  return resolvePackage(vfs, specifier);
}

export function getLoader(path: string): string {
  const ext = extension(path);
  if (path.endsWith('.module.css')) return 'local-css';
  if (ext === '.tsx') return 'tsx';
  if (ext === '.ts') return 'ts';
  if (ext === '.jsx') return 'jsx';
  if (ext === '.json') return 'json';
  if (ext === '.css') return 'css';
  if (ASSET_EXTENSIONS.has(ext)) return 'file';
  return 'js';
}

export function findEntryPoint(vfs: VfsLike): string {
  for (const path of [
    '/src/main.tsx',
    '/src/main.jsx',
    '/src/index.tsx',
    '/src/index.jsx',
    '/src/main.ts',
    '/src/main.js',
    '/src/index.ts',
    '/src/index.js',
  ]) {
    if (vfs.existsSync(path)) return path;
  }
  throw new Error(
    'No SPA entry point found. Add src/main.{js,jsx,ts,tsx} or src/index.{js,jsx,ts,tsx}.',
  );
}
