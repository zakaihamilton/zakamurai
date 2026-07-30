import { buildCssModuleJavaScript } from './css-modules';
import type {
  EsbuildApi,
  EsbuildBuild,
  EsbuildOutputFile,
  OnLog,
  PackageJson,
  VfsLike,
} from './types';

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

let initializePromise: Promise<void> | undefined;
let esbuildApi: EsbuildApi | undefined;

const ESBUILD_WASM_URL = '/esbuild/esbuild.wasm';

function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index > 0 ? path.slice(0, index) : '/';
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function extension(path: string): string {
  const name = basename(path);
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index).toLowerCase();
}

function normalizePath(path: string): string {
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

function resolveFile(vfs: VfsLike, candidate: string): string | null {
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

function applyBrowserRemap(manifest: PackageJson | null, relativePath: string): string {
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

function packageEntry(manifest: PackageJson): string {
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

function selectExport(target: unknown): string | null {
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

function exportTarget(exportsField: unknown, subpath: string): string | null {
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

function resolvePackage(vfs: VfsLike, specifier: string): string {
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

function resolveSpecifier(vfs: VfsLike, specifier: string, resolveDir: string): string | null {
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

function getLoader(path: string): string {
  const ext = extension(path);
  if (path.endsWith('.module.css')) return 'js';
  if (ext === '.tsx') return 'tsx';
  if (ext === '.ts') return 'ts';
  if (ext === '.jsx') return 'jsx';
  if (ext === '.json') return 'json';
  if (ext === '.css') return 'css';
  if (ASSET_EXTENSIONS.has(ext)) return 'file';
  return 'js';
}

function findEntryPoint(vfs: VfsLike): string {
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

export function assertBrowserBuildSupported(vfs: VfsLike, buildCommand: string): void {
  const configNames = [
    'vite.config.js',
    'vite.config.mjs',
    'vite.config.cjs',
    'vite.config.ts',
    'vite.config.mts',
  ];
  const config = configNames.find((name) => vfs.existsSync(`/${name}`));
  if (config) {
    throw new Error(
      `Browser builds do not execute ${config}. Remove it or use supported defaults.`,
    );
  }
  if (/(?:^|\s)--(?:config|plugin|outDir|base|ssr|watch)(?:\s|=|$)/.test(buildCommand)) {
    throw new Error('Browser builds do not support custom Vite/esbuild config files or plugins.');
  }
}

function removeTree(vfs: VfsLike, path: string): void {
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

function copyPublicFiles(vfs: VfsLike, from = '/public', to = '/dist'): string[] {
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

async function initialize(): Promise<void> {
  if (!initializePromise) {
    initializePromise = import('esbuild-wasm/lib/browser')
      .then(async (module) => {
        esbuildApi = module as EsbuildApi;
        const response = await fetch(ESBUILD_WASM_URL, { credentials: 'same-origin' });
        if (!response.ok) {
          throw new Error(`Unable to load the esbuild compiler asset (${response.status}).`);
        }
        const wasmModule = await WebAssembly.compile(await response.arrayBuffer());
        await esbuildApi.initialize({ wasmModule, worker: true });
      })
      .catch((error) => {
        initializePromise = undefined;
        esbuildApi = undefined;
        throw error;
      });
  }
  return initializePromise;
}

function defaultHtml(packageName: string | undefined, entryPath: string): string {
  return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${packageName || 'Zakamurai App'}</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="${entryPath}"></script>\n</body>\n</html>`;
}

function createHtml(
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
  const script = js ? `<script type="module" src="${js.path}"></script>` : '';
  const style = css ? `<link rel="stylesheet" href="${css.path}">` : '';
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

export function isBrowserBundleCommand(cmd: string, args: string[] = []): boolean {
  const runners = new Set(['npx', 'npm', 'pnpm', 'yarn', 'bunx']);
  const supportedBuildTools = new Set(['vite', 'react-scripts']);
  let binary = cmd;
  let binaryArgs = args;

  if (runners.has(cmd)) {
    let index = 0;
    if ((cmd === 'npm' || cmd === 'pnpm') && args[0] === 'exec') {
      index = 1;
    }
    while (index < args.length && args[index].startsWith('-')) {
      index += 1;
    }
    binary = args[index];
    binaryArgs = args.slice(index + 1);
  }

  if (!binary) return false;
  const name = binary.split('/').pop();
  return (
    (supportedBuildTools.has(name || '') && binaryArgs.includes('build')) || name === 'esbuild'
  );
}

export function parseBuildCommand(command: string): string[][] {
  const commands: string[][] = [];
  let tokens: string[] = [];
  let token = '';
  let quote: string | null = null;
  const finishToken = () => {
    if (token) tokens.push(token);
    token = '';
  };
  const finishCommand = () => {
    finishToken();
    if (tokens.length) commands.push(tokens);
    tokens = [];
  };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) quote = null;
      else if (char === '\\' && quote === '"' && index + 1 < command.length)
        token += command[++index];
      else token += char;
    } else if (char === '"' || char === "'") quote = char;
    else if (/\s/.test(char)) finishToken();
    else if (char === '&' && command[index + 1] === '&') {
      finishCommand();
      index += 1;
    } else if ('|;<>`'.includes(char) || char === '&') {
      throw new Error(
        `Unsupported shell operator '${char}' in build command. Use a standard Vite SPA build script.`,
      );
    } else token += char;
  }
  if (quote) throw new Error('Unterminated quote in build command.');
  finishCommand();
  return commands;
}

export async function bundleBrowserProject(
  vfs: VfsLike,
  packageJson: PackageJson,
  buildCommand: string,
  onLog: OnLog = () => {},
): Promise<{ entryPoint: string; files: string[] }> {
  assertBrowserBuildSupported(vfs, buildCommand);
  const entryPoint = findEntryPoint(vfs);
  onLog(`Bundling ${entryPoint} with esbuild-wasm...`);

  removeTree(vfs, '/dist');
  await initialize();

  if (!esbuildApi) {
    throw new Error('esbuild-wasm failed to initialize.');
  }

  const result = await esbuildApi.build({
    absWorkingDir: '/',
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    splitting: true,
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2020'],
    minify: true,
    sourcemap: false,
    write: false,
    outdir: '/dist',
    entryNames: 'assets/[name]-[hash]',
    chunkNames: 'assets/chunk-[hash]',
    assetNames: 'assets/[name]-[hash]',
    plugins: [
      {
        name: 'virtual-filesystem',
        setup(build: EsbuildBuild) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (
              args.path.startsWith('data:') ||
              args.path.startsWith('http:') ||
              args.path.startsWith('https:')
            ) {
              return { path: args.path, external: true };
            }
            let path: string | null;
            try {
              path = resolveSpecifier(
                vfs,
                args.path,
                args.resolveDir || dirname(args.importer || entryPoint),
              );
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              return { errors: [{ text: message }] };
            }
            if (!path)
              return {
                errors: [
                  { text: `Cannot resolve '${args.path}' from '${args.importer || entryPoint}'.` },
                ],
              };
            return { path, namespace: 'vfs' };
          });
          build.onLoad({ filter: /.*/, namespace: 'vfs' }, (args) => {
            const contents = vfs.readFileSync(args.path, 'utf8');
            const cssModule = args.path.endsWith('.module.css');
            return {
              contents: cssModule ? buildCssModuleJavaScript(args.path, contents).js : contents,
              loader: getLoader(args.path),
              resolveDir: dirname(args.path),
            };
          });
        },
      },
    ],
  });

  for (const file of result.outputFiles) {
    vfs.writeFileSync(file.path, file.contents);
  }
  const html = createHtml(vfs, packageJson, entryPoint, result.outputFiles);
  vfs.writeFileSync('/dist/index.html', html);
  const names = result.outputFiles.map((file) => file.path.replace('/dist/', ''));
  names.push(...copyPublicFiles(vfs));
  onLog(
    `Bundling complete. Generated /dist: index.html${names.length ? `, ${names.join(', ')}` : ''}`,
  );
  return { entryPoint, files: ['index.html', ...names] };
}

export const __testables = {
  findEntryPoint,
  applyBrowserRemap,
  packageEntry,
  selectExport,
  exportTarget,
  resolveFile,
  resolvePackage,
  resolveSpecifier,
  getLoader,
  createHtml,
  removeTree,
  copyPublicFiles,
  parseBuildCommand,
  initialize,
  resetInitialize() {
    initializePromise = undefined;
    esbuildApi = undefined;
  },
};
