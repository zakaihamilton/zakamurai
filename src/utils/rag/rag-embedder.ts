export const RAG_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const MAX_EMBED_TOKENS = 120;

export type RagInferenceDevice = 'webgpu' | 'wasm';

export type RagTokenizer = {
  model_max_length?: number;
  encode: (text: string, options?: { add_special_tokens?: boolean }) => number[];
};

export type FeatureExtractor = {
  (
    text: string,
    options: { pooling: string; normalize: boolean },
  ): Promise<{ data: Float32Array | number[] }>;
  tokenizer?: RagTokenizer;
  dispose?: () => void | Promise<void>;
};

let extractor: FeatureExtractor | undefined;
let extractorDevice: RagInferenceDevice | undefined;
let webGPUUnavailable = false;
let transformersPromise: Promise<unknown> | undefined;

export async function loadTransformers(): Promise<{
  pipeline: (
    task: string,
    model: string,
    options: Record<string, unknown>,
  ) => Promise<FeatureExtractor>;
}> {
  if (!transformersPromise) {
    transformersPromise = (async () => {
      const { env, pipeline } = await import('@huggingface/transformers');

      (env as { allowLocalModels: boolean }).allowLocalModels = false;
      (env as { useBrowserCache: boolean }).useBrowserCache = true;

      const envRecord = env as {
        backends?: { onnx?: { wasm: { wasmPaths: string } } };
        wasmPaths?: string;
      };
      if (envRecord.backends?.onnx) {
        envRecord.backends.onnx.wasm.wasmPaths = '/wasm/';
        console.log('[RAG] Set backend wasmPaths to:', envRecord.backends.onnx.wasm.wasmPaths);
      }
      envRecord.wasmPaths = '/wasm/';
      console.log('[RAG] Initialized with wasmPaths:', envRecord.wasmPaths);

      return { env, pipeline };
    })().catch((error) => {
      transformersPromise = undefined;
      throw error;
    });
  }
  return transformersPromise as Promise<{
    pipeline: (
      task: string,
      model: string,
      options: Record<string, unknown>,
    ) => Promise<FeatureExtractor>;
  }>;
}

export function tokenCount(text: string): number {
  if (extractor?.tokenizer) {
    return extractor.tokenizer.encode(text, { add_special_tokens: false }).length;
  }
  return Math.ceil(new TextEncoder().encode(text).byteLength / 3);
}

export function effectiveTokenLimit(): number {
  const modelLimit = extractor?.tokenizer?.model_max_length;
  return Number.isFinite(modelLimit) && modelLimit && modelLimit > 2
    ? Math.min(MAX_EMBED_TOKENS, modelLimit - 2)
    : MAX_EMBED_TOKENS;
}

export function getExtractor(): FeatureExtractor | undefined {
  return extractor;
}

export async function disposeExtractor(): Promise<void> {
  const currentExtractor = extractor;
  extractor = undefined;
  extractorDevice = undefined;
  transformersPromise = undefined;
  await currentExtractor?.dispose?.();
}

export async function ensureExtractor(device: RagInferenceDevice = 'webgpu'): Promise<void> {
  const effectiveDevice: RagInferenceDevice =
    device === 'webgpu' && !webGPUUnavailable ? 'webgpu' : 'wasm';
  if (extractor && extractorDevice !== effectiveDevice) {
    await disposeExtractor();
  }
  if (!extractor) {
    const { pipeline } = await loadTransformers();
    if (effectiveDevice === 'wasm') {
      extractor = await pipeline('feature-extraction', RAG_MODEL_ID, { device: 'wasm' });
      extractorDevice = 'wasm';
    } else {
      try {
        extractor = await pipeline('feature-extraction', RAG_MODEL_ID, {
          device: 'webgpu',
          dtype: 'fp16',
        });
        extractorDevice = 'webgpu';
      } catch (error) {
        console.warn('[RAG] WebGPU failed, falling back to WASM:', error);
        webGPUUnavailable = true;
        extractor = await pipeline('feature-extraction', RAG_MODEL_ID, { device: 'wasm' });
        extractorDevice = 'wasm';
      }
    }
  }
}

export async function embedText(text: string): Promise<Float32Array> {
  if (!extractor) throw new Error('[RAG] Embedding model is unavailable.');
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  const vector = Float32Array.from(output.data);
  if (vector.length === 0 || !vector.every((value) => Number.isFinite(value))) {
    throw new Error('[RAG] Embedding model returned an invalid vector.');
  }
  return vector;
}

export function resetTransformers(): void {
  transformersPromise = undefined;
}

export async function resetEmbedder(): Promise<void> {
  await disposeExtractor();
  webGPUUnavailable = false;
}
