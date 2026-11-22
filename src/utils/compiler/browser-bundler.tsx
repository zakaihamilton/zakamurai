import {
  assertBrowserBuildSupported,
  ignoredBrowserViteConfig,
  isBrowserBundleCommand,
  parseBuildCommand,
} from './build-command';
import { copyPublicFiles, createHtml, removeTree } from './dist-html';
import type { EsbuildApi, EsbuildBuild, OnLog, PackageJson, VfsLike } from './types';
import {
  applyBrowserRemap,
  dirname,
  exportTarget,
  findEntryPoint,
  getLoader,
  packageEntry,
  resolveFile,
  resolvePackage,
  resolveSpecifier,
  selectExport,
} from './vfs-resolver';

export {
  assertBrowserBuildSupported,
  ignoredBrowserViteConfig,
  isBrowserBundleCommand,
  parseBuildCommand,
};

let initializePromise: Promise<void> | undefined;
let esbuildApi: EsbuildApi | undefined;

const ESBUILD_WASM_URL = '/esbuild/esbuild.wasm';

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

export async function bundleBrowserProject(
  vfs: VfsLike,
  packageJson: PackageJson,
  buildCommand: string,
  onLog: OnLog = () => {},
): Promise<{ entryPoint: string; files: string[] }> {
  assertBrowserBuildSupported(vfs, buildCommand);
  const ignoredConfig = ignoredBrowserViteConfig(vfs);
  if (ignoredConfig) {
    onLog(
      `Ignoring ${ignoredConfig}; browser builds use supported defaults instead of executing Vite config.`,
    );
  }
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
            return {
              contents: vfs.readFileSync(args.path, 'utf8'),
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
