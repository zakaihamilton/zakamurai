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

let initializePromise;
let esbuildApi;

function dirname(path) {
  const index = path.lastIndexOf('/');
  return index > 0 ? path.slice(0, index) : '/';
}

function basename(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

function extension(path) {
  const name = basename(path);
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index).toLowerCase();
}

function normalizePath(path) {
  const parts = [];
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return `/${parts.join('/')}`;
}

function resolveFile(vfs, candidate) {
  for (const suffix of SOURCE_EXTENSIONS) {
    const path = `${candidate}${suffix}`;
    if (vfs.existsSync(path)) return path;
  }
  for (const suffix of SOURCE_EXTENSIONS.slice(1)) {
    const indexPath = `${candidate}/index${suffix}`;
    if (vfs.existsSync(indexPath)) return indexPath;
  }
  return null;
}

function packageParts(specifier) {
  const parts = specifier.split('/');
  const count = specifier.startsWith('@') ? 2 : 1;
  return [parts.slice(0, count).join('/'), parts.slice(count).join('/')];
}

function packageEntry(manifest) {
  // Object-shaped "browser" maps (e.g. react-dom) remaps specific files and must
  // not be treated as the package entry path.
  for (const field of ['browser', 'module', 'main']) {
    const value = manifest[field];
    if (typeof value === 'string' && value) return value;
  }
  return 'index.js';
}

function selectExport(target) {
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) {
    for (const item of target) {
      const selected = selectExport(item);
      if (selected) return selected;
    }
    return null;
  }
  if (!target || typeof target !== 'object') return null;

  // These are the conditions esbuild uses for our browser ESM bundle. Keep
  // default as a fallback because many packages only provide that condition.
  for (const condition of ['browser', 'import', 'default']) {
    const selected = selectExport(target[condition]);
    if (selected) return selected;
  }
  return null;
}

function exportTarget(exportsField, subpath) {
  if (typeof exportsField === 'string' || Array.isArray(exportsField)) {
    return subpath ? null : selectExport(exportsField);
  }
  if (!exportsField || typeof exportsField !== 'object') return null;
  const key = subpath ? `./${subpath}` : '.';
  // A conditional root export omits the '.' key entirely.
  if (!subpath && Object.keys(exportsField).every((entry) => !entry.startsWith('.'))) {
    return selectExport(exportsField);
  }
  if (Object.hasOwn(exportsField, key)) return selectExport(exportsField[key]);

  // Package export patterns are common for icon/component libraries.
  for (const [pattern, target] of Object.entries(exportsField)) {
    if (!pattern.includes('*')) continue;
    const [start, end] = pattern.split('*');
    if (!key.startsWith(start) || !key.endsWith(end)) continue;
    const replacement = key.slice(start.length, key.length - end.length);
    const selected = selectExport(target);
    if (selected) return selected.replaceAll('*', replacement);
  }
  return null;
}

function parseManifest(vfs, manifestPath, packageName) {
  try {
    const parsed = JSON.parse(vfs.readFileSync(manifestPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    return parsed;
  } catch (error) {
    throw new Error(
      `Cannot read package '${packageName}': malformed ${manifestPath} (${error.message}).`,
    );
  }
}

function resolvePackage(vfs, specifier) {
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
  const resolved = resolveFile(vfs, normalizePath(`${root}/${candidate}`));
  if (resolved) return resolved;
  throw new Error(
    `Package '${packageName}' does not provide '${subpath ? `./${subpath}` : '.'}' for browser imports.`,
  );
}

function resolveSpecifier(vfs, specifier, resolveDir) {
  if (specifier.startsWith('/') || specifier.startsWith('.')) {
    const candidate = normalizePath(
      specifier.startsWith('/') ? specifier : `${resolveDir}/${specifier}`,
    );
    // Vite serves /public files from the site root. Resolve absolute imports
    // against that directory when they are not source files.
    return (
      resolveFile(vfs, candidate) ||
      (specifier.startsWith('/') ? resolveFile(vfs, `/public${candidate}`) : null)
    );
  }
  return resolvePackage(vfs, specifier);
}

function getLoader(path) {
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

function findEntryPoint(vfs) {
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

export function assertBrowserBuildSupported(vfs, buildCommand) {
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

function removeTree(vfs, path) {
  if (!vfs.existsSync(path)) return;
  for (const name of vfs.readdirSync(path)) {
    const child = `${path}/${name}`;
    try {
      removeTree(vfs, child);
    } catch (_) {
      vfs.unlinkSync(child);
    }
  }
  try {
    vfs.rmdirSync(path);
  } catch (_) {
    vfs.unlinkSync(path);
  }
}

function copyPublicFiles(vfs, from = '/public', to = '/dist') {
  if (!vfs.existsSync(from)) return [];
  const copied = [];
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

async function initialize() {
  if (!initializePromise) {
    initializePromise = import('esbuild-wasm/lib/browser')
      .then(async (module) => {
        esbuildApi = module;
        await esbuildApi.initialize({ wasmURL: '/esbuild/esbuild.wasm', worker: true });
      })
      .catch((error) => {
        initializePromise = undefined;
        esbuildApi = undefined;
        throw error;
      });
  }
  return initializePromise;
}

function defaultHtml(packageName, entryPath) {
  return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${packageName || 'Zakamurai App'}</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="${entryPath}"></script>\n</body>\n</html>`;
}

function createHtml(vfs, packageJson, entryPath, outputFiles) {
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

/** True for bare or package-runner SPA build commands (vite build / npx vite build / esbuild). */
export function isBrowserBundleCommand(cmd, args = []) {
  const runners = new Set(['npx', 'npm', 'pnpm', 'yarn', 'bunx']);
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
  return (name === 'vite' && binaryArgs.includes('build')) || name === 'esbuild';
}

/** Split a shell-like build script without executing shell syntax. */
export function parseBuildCommand(command) {
  const commands = [];
  let tokens = [];
  let token = '';
  let quote = null;
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

/** Bundle a standard SPA from almostnode's virtual filesystem into /dist. */
export async function bundleBrowserProject(vfs, packageJson, buildCommand, onLog = () => {}) {
  assertBrowserBuildSupported(vfs, buildCommand);
  const entryPoint = findEntryPoint(vfs);
  onLog(`Bundling ${entryPoint} with esbuild-wasm...`);

  // A failed or changed build must never leave an old preview behind.
  removeTree(vfs, '/dist');
  await initialize();

  const result = await esbuildApi.build({
    absWorkingDir: '/',
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    splitting: true,
    platform: 'browser',
    // Match Vite's default so .jsx/.tsx work without importing React.
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
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (
              args.path.startsWith('data:') ||
              args.path.startsWith('http:') ||
              args.path.startsWith('https:')
            ) {
              return { path: args.path, external: true };
            }
            let path;
            try {
              path = resolveSpecifier(
                vfs,
                args.path,
                args.resolveDir || dirname(args.importer || entryPoint),
              );
            } catch (error) {
              return { errors: [{ text: error.message }] };
            }
            if (!path)
              return {
                errors: [
                  { text: `Cannot resolve '${args.path}' from '${args.importer || entryPoint}'.` },
                ],
              };
            return { path, namespace: 'vfs' };
          });
          build.onLoad({ filter: /.*/, namespace: 'vfs' }, (args) => ({
            contents: vfs.readFileSync(args.path),
            loader: getLoader(args.path),
            resolveDir: dirname(args.path),
          }));
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
