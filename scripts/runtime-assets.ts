import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ALMOSTNODE_SOURCE = join(ROOT, 'node_modules', 'almostnode', 'dist');
const ONNX_SOURCE = join(ROOT, 'node_modules', 'onnxruntime-web', 'dist');
const ESBUILD_SOURCE = join(ROOT, 'node_modules', 'esbuild-wasm', 'esbuild.wasm');
const ALMOSTNODE_DEST = join(ROOT, 'public', 'lib', 'almostnode');
const PUBLIC_ASSETS_DEST = join(ROOT, 'public', 'assets');
const WASM_DEST = join(ROOT, 'public', 'wasm');
const ESBUILD_DEST = join(ROOT, 'public', 'esbuild');
const MAX_GENERATED_BYTES = 75 * 1024 * 1024;

export const RUNTIME_ASSET_MANIFEST = {
  onnx: [
    'ort-wasm-simd-threaded.mjs',
    'ort-wasm-simd-threaded.wasm',
    'ort-wasm-simd-threaded.asyncify.mjs',
    'ort-wasm-simd-threaded.asyncify.wasm',
  ],
  almostnodeRoot: ['index.mjs', '__sw__.js'],
  esbuild: ['esbuild.wasm'],
} as const;

function copyFile(source: string, destination: string): void {
  if (!existsSync(source)) throw new Error(`Required runtime asset is missing: ${source}`);
  mkdirSync(resolve(destination, '..'), { recursive: true });
  cpSync(source, destination);
}

function clearDirectory(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
}

function runtimeWorkerNames(): string[] {
  const sourceDirectory = join(ALMOSTNODE_SOURCE, 'assets');
  if (!existsSync(sourceDirectory))
    throw new Error(`Missing almostnode assets directory: ${sourceDirectory}`);
  const names = readdirSync(sourceDirectory).filter((name) =>
    /^runtime-worker-[\w-]+\.js$/.test(name),
  );
  if (names.length === 0) throw new Error('No almostnode runtime worker asset was found.');
  return names;
}

function setupAlmostnode(): void {
  clearDirectory(ALMOSTNODE_DEST);
  clearDirectory(PUBLIC_ASSETS_DEST);

  for (const name of RUNTIME_ASSET_MANIFEST.almostnodeRoot) {
    copyFile(join(ALMOSTNODE_SOURCE, name), join(ALMOSTNODE_DEST, name));
  }

  for (const name of runtimeWorkerNames()) {
    copyFile(join(ALMOSTNODE_SOURCE, 'assets', name), join(ALMOSTNODE_DEST, 'assets', name));
    copyFile(join(ALMOSTNODE_SOURCE, 'assets', name), join(PUBLIC_ASSETS_DEST, name));
  }
}

function setupWasm(): void {
  clearDirectory(WASM_DEST);
  clearDirectory(ESBUILD_DEST);

  for (const name of RUNTIME_ASSET_MANIFEST.onnx) {
    copyFile(join(ONNX_SOURCE, name), join(WASM_DEST, name));
  }
  copyFile(ESBUILD_SOURCE, join(ESBUILD_DEST, RUNTIME_ASSET_MANIFEST.esbuild[0]));
}

function collectFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
}

function assertExactFiles(directory: string, expected: string[], label: string): void {
  const actual = collectFiles(directory)
    .map((file) => relative(directory, file))
    .sort();
  const sortedExpected = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
    throw new Error(
      `${label} manifest mismatch.\nExpected:\n${sortedExpected.join('\n')}\nActual:\n${actual.join('\n')}`,
    );
  }
}

function generatedBytes(): number {
  return [WASM_DEST, ESBUILD_DEST, ALMOSTNODE_DEST, PUBLIC_ASSETS_DEST]
    .flatMap(collectFiles)
    .reduce((total, file) => total + statSync(file).size, 0);
}

function checkRuntimeAssets(): void {
  const workers = runtimeWorkerNames();
  assertExactFiles(WASM_DEST, [...RUNTIME_ASSET_MANIFEST.onnx], 'ONNX WASM');
  assertExactFiles(ESBUILD_DEST, [...RUNTIME_ASSET_MANIFEST.esbuild], 'esbuild');
  assertExactFiles(
    ALMOSTNODE_DEST,
    [...RUNTIME_ASSET_MANIFEST.almostnodeRoot, ...workers.map((name) => join('assets', name))],
    'almostnode',
  );
  assertExactFiles(PUBLIC_ASSETS_DEST, workers, 'public assets');

  const forbidden = [
    ...collectFiles(WASM_DEST),
    ...collectFiles(ALMOSTNODE_DEST),
    ...collectFiles(PUBLIC_ASSETS_DEST),
  ].filter((file) => /\.(?:map|d\.ts)$/.test(file));
  if (forbidden.length > 0) {
    throw new Error(
      `Generated runtime contains forbidden source/declaration files:\n${forbidden.join('\n')}`,
    );
  }

  const bytes = generatedBytes();
  if (bytes > MAX_GENERATED_BYTES) {
    throw new Error(
      `Generated runtime asset budget exceeded: ${(bytes / 1024 / 1024).toFixed(1)} MB > 75 MB.`,
    );
  }
  const fileCount = [WASM_DEST, ESBUILD_DEST, ALMOSTNODE_DEST, PUBLIC_ASSETS_DEST].flatMap(
    collectFiles,
  ).length;
  console.log(
    `Generated runtime assets passed: ${(bytes / 1024 / 1024).toFixed(1)} MB across ${fileCount} files.`,
  );
}

const mode = process.argv[2] || '--all';
if (mode === '--almostnode' || mode === '--all') setupAlmostnode();
if (mode === '--wasm' || mode === '--all') setupWasm();
if (mode === '--check') checkRuntimeAssets();
