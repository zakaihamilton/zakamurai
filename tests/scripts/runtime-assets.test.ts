import { describe, expect, it } from 'vitest';
import { RUNTIME_ASSET_MANIFEST } from '../../scripts/runtime-assets';

describe('runtime asset manifest', () => {
  it('keeps the RAG WASM surface limited to the supported CPU paths', () => {
    expect(RUNTIME_ASSET_MANIFEST.onnx).toEqual([
      'ort-wasm-simd-threaded.mjs',
      'ort-wasm-simd-threaded.wasm',
      'ort-wasm-simd-threaded.asyncify.mjs',
      'ort-wasm-simd-threaded.asyncify.wasm',
    ]);
  });

  it('does not include source maps, declarations, or demo entrypoints', () => {
    const files = [
      ...RUNTIME_ASSET_MANIFEST.onnx,
      ...RUNTIME_ASSET_MANIFEST.almostnodeRoot,
      ...RUNTIME_ASSET_MANIFEST.esbuild,
    ];
    expect(files.some((file) => /\.(?:map|d\.ts)$/.test(file))).toBe(false);
    expect(files.some((file) => /demo|example/i.test(file))).toBe(false);
  });
});
