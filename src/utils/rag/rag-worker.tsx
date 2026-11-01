type LinkedCss = {
  filePath: string;
  content: string;
};

type RagChunk = {
  vector: Float32Array;
  filePath: string;
  content: string;
  hash: string;
  fileHash: string;
  cssLinks: string[];
  timestamp: number;
};

type SearchResult = {
  filePath: string;
  content: string;
  hash: string;
  timestamp: number;
  score: number;
  linkedCss: LinkedCss[];
};

type RagInferenceDevice = 'webgpu' | 'wasm';

type RagTokenizer = {
  model_max_length?: number;
  encode: (text: string, options?: { add_special_tokens?: boolean }) => number[];
};

type FeatureExtractor = {
  (
    text: string,
    options: { pooling: string; normalize: boolean },
  ): Promise<{ data: Float32Array | number[] }>;
  tokenizer?: RagTokenizer;
  dispose?: () => void | Promise<void>;
};

type PersistedIndex = {
  schemaVersion: number;
  modelId: string;
  chunks: Array<Omit<RagChunk, 'vector'> & { vector: number[] }>;
  fileHashes: Array<[string, string]>;
};

type SyncSummary = {
  indexedFileCount: number;
  indexedChunkCount: number;
  skippedFileCount: number;
  skippedChunkCount: number;
};

const RAG_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const INDEX_SCHEMA_VERSION = 3;
const DB_NAME = 'zakamurai-rag-data.json';
const MAX_INDEX_ITEMS = 1500;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_EMBED_TOKENS = 120;
const CHUNK_OVERLAP_TOKENS = 20;
const MAX_CHUNK_SOURCE_CHARS = 1600;
const MAX_QUERY_SOURCE_CHARS = 4000;
const MIN_SEARCH_SCORE = 0.2;
const MAX_RESULTS_PER_FILE = 2;
const MAX_LINKED_CSS_CHARS = 8000;

let extractor: FeatureExtractor | undefined;
let extractorDevice: RagInferenceDevice | undefined;
let webGPUUnavailable = false;
let index: RagChunk[] = [];
let fileHashes = new Map<string, string>();
let stylesheetContents = new Map<string, string>();
let indexLoaded = false;
let transformersPromise: Promise<unknown> | undefined;

async function loadTransformers(): Promise<{
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

function tokenCount(text: string): number {
  if (extractor?.tokenizer) {
    return extractor.tokenizer.encode(text, { add_special_tokens: false }).length;
  }
  return Math.ceil(new TextEncoder().encode(text).byteLength / 3);
}

function longestPrefixWithinTokenLimit(text: string, limit: number): number {
  let low = 1;
  let high = text.length;
  let best = 0;

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const safeMidpoint =
      midpoint < text.length && /[\uDC00-\uDFFF]/.test(text[midpoint]) ? midpoint + 1 : midpoint;
    if (tokenCount(text.slice(0, safeMidpoint)) <= limit) {
      best = safeMidpoint;
      low = safeMidpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  return best || Math.min(1, text.length);
}

function earliestSuffixWithinTokenLimit(text: string, limit: number): number {
  let low = 0;
  let high = text.length;
  let best = text.length;

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const safeMidpoint =
      midpoint > 0 && /[\uDC00-\uDFFF]/.test(text[midpoint]) ? midpoint + 1 : midpoint;
    if (tokenCount(text.slice(safeMidpoint)) <= limit) {
      best = safeMidpoint;
      high = midpoint - 1;
    } else {
      low = midpoint + 1;
    }
  }

  return best;
}

const SYMBOL_BOUNDARY_RE =
  /\n(?=(?:export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|interface|type)\s+[A-Za-z0-9_$]+|(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(|class\s+[A-Za-z0-9_$]+\s*(?:extends|implements|\{)|\.(?:[A-Za-z_-][A-Za-z0-9_-]*)\s*\{|@media\b|@keyframes\b))/g;

function extractSymbolHeader(segment: string): string | null {
  for (const rawLine of segment.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;
    const codeMatch = line.match(
      /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|interface|type)\s+([A-Za-z0-9_$]+)/,
    );
    if (codeMatch?.[1]) return codeMatch[1];
    const cssMatch = line.match(/^(\.[A-Za-z_-][A-Za-z0-9_-]*)\s*\{/);
    if (cssMatch?.[1]) return cssMatch[1];
  }
  return null;
}

function splitSegmentByTokenWindow(segment: string, headerPrefix = ''): string[] {
  const chunks: string[] = [];
  let remaining = segment.trim();
  let overlap = '';

  while (remaining.length > 0) {
    const candidate = overlap + remaining.slice(0, MAX_CHUNK_SOURCE_CHARS);
    const effectiveLimit = Math.max(
      32,
      MAX_EMBED_TOKENS - (headerPrefix ? tokenCount(headerPrefix) : 0),
    );
    let cut = candidate.length;
    if (tokenCount(candidate) > effectiveLimit) {
      cut = longestPrefixWithinTokenLimit(candidate, effectiveLimit);
      const boundary = Math.max(candidate.lastIndexOf('\n', cut), candidate.lastIndexOf(' ', cut));
      if (boundary > overlap.length && boundary >= cut * 0.55) {
        cut = boundary + 1;
      }
    }
    if (cut <= overlap.length) {
      cut = longestPrefixWithinTokenLimit(candidate, effectiveLimit);
    }
    if (cut < candidate.length && /[\uDC00-\uDFFF]/.test(candidate[cut])) cut--;
    while (cut > overlap.length && tokenCount(candidate.slice(0, cut)) > effectiveLimit) {
      cut--;
      if (cut > 0 && /[\uDC00-\uDFFF]/.test(candidate[cut])) cut--;
    }

    const rawSlice = candidate.slice(0, cut).trim();
    if (rawSlice.length > 10) {
      chunks.push(headerPrefix ? `${headerPrefix}\n${rawSlice}` : rawSlice);
    }

    const consumed = Math.min(remaining.length, Math.max(1, cut - overlap.length));
    remaining = remaining.slice(consumed);
    overlap = rawSlice
      .slice(earliestSuffixWithinTokenLimit(rawSlice, CHUNK_OVERLAP_TOKENS))
      .trimStart();
  }

  return chunks;
}

function splitIntoChunks(content: string, filePath?: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  const rawSegments = trimmed
    .split(SYMBOL_BOUNDARY_RE)
    .map((s) => s.trim())
    .filter(Boolean);
  if (rawSegments.length <= 1) {
    const symbol = extractSymbolHeader(trimmed);
    const prefix = filePath && symbol ? `// File: ${filePath} | Symbol: ${symbol}` : '';
    return splitSegmentByTokenWindow(trimmed, prefix);
  }

  const mergedSegments: string[] = [];
  for (const segment of rawSegments) {
    const prev = mergedSegments.at(-1);
    const prevIsImportsOnly = Boolean(
      prev && !extractSymbolHeader(prev) && /^import\b/m.test(prev),
    );
    if (
      prev &&
      tokenCount(`${prev}\n\n${segment}`) <= MAX_EMBED_TOKENS &&
      (!extractSymbolHeader(segment) || prevIsImportsOnly)
    ) {
      mergedSegments[mergedSegments.length - 1] = `${prev}\n\n${segment}`;
    } else {
      mergedSegments.push(segment);
    }
  }

  const allChunks: string[] = [];
  for (const segment of mergedSegments) {
    const symbol = extractSymbolHeader(segment);
    const prefix = filePath && symbol ? `// File: ${filePath} | Symbol: ${symbol}` : '';
    const subChunks = splitSegmentByTokenWindow(segment, prefix);
    allChunks.push(...subChunks);
  }
  return allChunks;
}

function resolveRelativePath(importerPath: string, importPath: string): string | null {
  const cleanImportPath = importPath.replace(/[?#].*$/, '');
  if (cleanImportPath.startsWith('@/')) return `src/${cleanImportPath.slice(2)}`;
  if (cleanImportPath.startsWith('/')) return cleanImportPath.slice(1);
  if (!cleanImportPath.startsWith('.')) return null;

  const parts = importerPath.split('/').slice(0, -1);
  for (const part of cleanImportPath.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.join('/');
}

function findStylesheetLinks(
  filePath: string,
  content: string,
  knownStyles: Set<string>,
): string[] {
  const importPattern =
    /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*)['"]([^'"]+\.css(?:[?#][^'"]*)?)['"]/g;
  const cssImportPattern =
    /@import\s+(?:url\(\s*(?:['"]([^'"]+\.css(?:[?#][^'"]*)?)['"]|([^\s)]+\.css(?:[?#][^\s)]*)?))\s*\)|['"]([^'"]+\.css(?:[?#][^'"]*)?)['"])/g;
  const links = new Set<string>();
  const imports = [
    ...[...content.matchAll(importPattern)].map((match) => match[1]),
    ...[...content.matchAll(cssImportPattern)].map((match) => match[1] || match[2] || match[3]),
  ];
  for (const importPath of imports) {
    if (!importPath) continue;
    const resolved = resolveRelativePath(filePath, importPath);
    if (resolved && knownStyles.has(resolved)) links.add(resolved);
  }
  return [...links];
}

function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  if (left.length === 0 || left.length !== right.length) return -1;
  let dotProduct = 0;
  for (let i = 0; i < left.length; i++) {
    dotProduct += left[i] * right[i];
  }
  return Number.isFinite(dotProduct) ? dotProduct : -1;
}

function toEmbeddingVector(data: Float32Array | number[]): Float32Array {
  const vector = Float32Array.from(data);
  if (vector.length === 0 || !vector.every((value) => Number.isFinite(value))) {
    throw new Error('[RAG] Embedding model returned an invalid vector.');
  }
  return vector;
}

function mapsMatch(left: Map<string, string>, right: Map<string, string>): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }
  return true;
}

function indexesMatch(left: RagChunk[], right: RagChunk[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, position) => {
    const next = right[position];
    return (
      item.filePath === next.filePath &&
      item.fileHash === next.fileHash &&
      item.hash === next.hash &&
      item.content === next.content &&
      item.cssLinks.join('\0') === next.cssLinks.join('\0')
    );
  });
}

async function loadIndex(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(DB_NAME, { create: true });
  const file = await fileHandle.getFile();
  const text = await file.text();

  index = [];
  fileHashes = new Map();
  if (!text) {
    indexLoaded = true;
    return;
  }

  try {
    const persisted = JSON.parse(text) as Partial<PersistedIndex>;
    if (
      persisted.schemaVersion === INDEX_SCHEMA_VERSION &&
      persisted.modelId === RAG_MODEL_ID &&
      Array.isArray(persisted.chunks) &&
      Array.isArray(persisted.fileHashes)
    ) {
      const chunksAreValid = persisted.chunks.every(
        (item) =>
          item &&
          typeof item.filePath === 'string' &&
          typeof item.content === 'string' &&
          typeof item.hash === 'string' &&
          typeof item.fileHash === 'string' &&
          Array.isArray(item.cssLinks) &&
          item.cssLinks.every((path) => typeof path === 'string') &&
          Array.isArray(item.vector) &&
          item.vector.length === 384 &&
          item.vector.every((value) => Number.isFinite(value)),
      );
      const fileHashesAreValid = persisted.fileHashes.every(
        (entry) =>
          Array.isArray(entry) &&
          entry.length === 2 &&
          typeof entry[0] === 'string' &&
          typeof entry[1] === 'string',
      );
      const persistedFileHashes = fileHashesAreValid
        ? new Map(persisted.fileHashes as Array<[string, string]>)
        : new Map<string, string>();
      const chunksMatchFileHashes =
        chunksAreValid &&
        persisted.chunks.every((item) => persistedFileHashes.get(item.filePath) === item.fileHash);

      if (!chunksAreValid || !fileHashesAreValid || !chunksMatchFileHashes) {
        throw new Error('Stored RAG index contains invalid entries.');
      }

      if (persisted.chunks.length > MAX_INDEX_ITEMS) {
        throw new Error('Stored RAG index exceeds the configured size limit.');
      }
      index = persisted.chunks.slice(-MAX_INDEX_ITEMS).map((item) => ({
        ...item,
        vector: Float32Array.from(item.vector),
        cssLinks: item.cssLinks,
      }));
      fileHashes = persistedFileHashes;
    }
  } catch (error) {
    // A malformed or obsolete index is rebuilt from the mounted workspace snapshot.
    console.warn('[RAG] Stored index is invalid and will be rebuilt:', error);
  }

  indexLoaded = true;
  console.log(`[RAG] Loaded ${index.length} chunks from OPFS.`);
}

async function saveIndex(
  nextIndex: RagChunk[],
  nextFileHashes: Map<string, string>,
): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(DB_NAME, { create: true });
  const writable = await fileHandle.createWritable();

  try {
    const persisted: PersistedIndex = {
      schemaVersion: INDEX_SCHEMA_VERSION,
      modelId: RAG_MODEL_ID,
      chunks: nextIndex.map((item) => ({ ...item, vector: Array.from(item.vector) })),
      fileHashes: [...nextFileHashes.entries()],
    };
    await writable.write(JSON.stringify(persisted));
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

async function disposeExtractor(): Promise<void> {
  const currentExtractor = extractor;
  extractor = undefined;
  extractorDevice = undefined;
  transformersPromise = undefined;
  await currentExtractor?.dispose?.();
}

async function init(device: RagInferenceDevice = 'webgpu'): Promise<void> {
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
  if (!indexLoaded) await loadIndex();
}

async function getHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createCssContentMap(files: Record<string, string>): Map<string, string> {
  return new Map(
    Object.entries(files).filter(
      ([path, content]) => path.toLowerCase().endsWith('.css') && typeof content === 'string',
    ),
  );
}

function createSearchResults(queryVector: Float32Array, k: number): SearchResult[] {
  const ranked = index
    .map((item) => ({
      item,
      score: cosineSimilarity(queryVector, item.vector),
    }))
    .filter(({ score }) => score >= MIN_SEARCH_SCORE)
    .sort((left, right) => right.score - left.score);

  const selected: Array<{ item: RagChunk; score: number }> = [];
  const perFile = new Map<string, number>();
  const selectedChunks = new Set<RagChunk>();
  const add = (candidate: { item: RagChunk; score: number }) => {
    if (selectedChunks.has(candidate.item)) return;
    const currentCount = perFile.get(candidate.item.filePath) || 0;
    if (currentCount >= MAX_RESULTS_PER_FILE) return;
    selected.push(candidate);
    selectedChunks.add(candidate.item);
    perFile.set(candidate.item.filePath, currentCount + 1);
  };

  for (const candidate of ranked) {
    if (selected.length >= k) break;
    if (!perFile.has(candidate.item.filePath)) add(candidate);
  }
  if (selected.length < k) {
    for (const candidate of ranked) {
      if (selected.length >= k) break;
      if (perFile.has(candidate.item.filePath)) add(candidate);
    }
  }

  return selected.map(({ item, score }) => ({
    filePath: item.filePath,
    content: item.content,
    hash: item.hash,
    timestamp: item.timestamp,
    score,
    linkedCss: item.cssLinks
      .map((filePath) => {
        const content = stylesheetContents.get(filePath);
        return content ? { filePath, content: content.slice(0, MAX_LINKED_CSS_CHARS) } : null;
      })
      .filter((linkedCss): linkedCss is LinkedCss => linkedCss !== null),
  }));
}

function effectiveTokenLimit(): number {
  const modelLimit = extractor?.tokenizer?.model_max_length;
  return Number.isFinite(modelLimit) && modelLimit && modelLimit > 2
    ? Math.min(MAX_EMBED_TOKENS, modelLimit - 2)
    : MAX_EMBED_TOKENS;
}

async function indexFile({
  filePath,
  content,
  device,
}: {
  filePath: string;
  content: string;
  device?: RagInferenceDevice;
}): Promise<void> {
  await init(device);
  const nextIndex = index.filter((item) => item.filePath !== filePath);
  const nextFileHashes = new Map(fileHashes);
  nextFileHashes.delete(filePath);
  const byteLength = new TextEncoder().encode(content).byteLength;

  if (!content || byteLength > MAX_FILE_BYTES) {
    nextFileHashes.delete(filePath);
    await saveIndex(nextIndex, nextFileHashes);
    index = nextIndex;
    fileHashes = nextFileHashes;
    stylesheetContents.delete(filePath);
    return;
  }

  const fileHash = await getHash(content);
  const chunks = splitIntoChunks(content, filePath);
  const cssLinks = findStylesheetLinks(filePath, content, new Set(stylesheetContents.keys()));
  const seen = new Set<string>();
  const uniqueChunks: Array<{ content: string; hash: string }> = [];
  for (const chunkContent of chunks) {
    const hash = await getHash(chunkContent);
    if (seen.has(hash)) continue;
    seen.add(hash);
    uniqueChunks.push({ content: chunkContent, hash });
  }

  const hasCapacity = nextIndex.length + uniqueChunks.length <= MAX_INDEX_ITEMS;
  if (hasCapacity) {
    for (const chunk of uniqueChunks) {
      if (!extractor) throw new Error('[RAG] Embedding model is unavailable.');
      const output = await extractor(chunk.content, { pooling: 'mean', normalize: true });
      nextIndex.push({
        vector: toEmbeddingVector(output.data),
        filePath,
        content: chunk.content,
        hash: chunk.hash,
        fileHash,
        cssLinks,
        timestamp: Date.now(),
      });
    }
  }

  if (hasCapacity) nextFileHashes.set(filePath, fileHash);
  await saveIndex(nextIndex, nextFileHashes);
  index = nextIndex;
  fileHashes = nextFileHashes;
  if (filePath.toLowerCase().endsWith('.css')) stylesheetContents.set(filePath, content);
}

async function syncWorkspace({
  files,
  device,
}: {
  files: Record<string, string>;
  device?: RagInferenceDevice;
}): Promise<SyncSummary> {
  await init(device);

  const entries: Array<[string, string]> = [];
  let skippedFileCount = 0;
  const encoder = new TextEncoder();
  for (const [filePath, content] of Object.entries(files).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (typeof content !== 'string' || encoder.encode(content).byteLength > MAX_FILE_BYTES) {
      skippedFileCount++;
      continue;
    }
    entries.push([filePath, content]);
  }

  const nextStylesheets = createCssContentMap(Object.fromEntries(entries));
  const knownStyles = new Set(nextStylesheets.keys());
  const previousChunksByFile = new Map<string, RagChunk[]>();
  for (const item of index) {
    const chunks = previousChunksByFile.get(item.filePath) || [];
    chunks.push(item);
    previousChunksByFile.set(item.filePath, chunks);
  }

  const nextIndex: RagChunk[] = [];
  const nextFileHashes = new Map<string, string>();
  let skippedChunkCount = 0;

  for (const [filePath, content] of entries) {
    const fileHash = await getHash(content);

    if (fileHashes.get(filePath) === fileHash) {
      const priorChunks = previousChunksByFile.get(filePath) || [];
      if (priorChunks.length > MAX_INDEX_ITEMS - nextIndex.length) {
        skippedChunkCount += priorChunks.length;
        continue;
      }
      for (const prior of priorChunks) {
        nextIndex.push(prior);
      }
      nextFileHashes.set(filePath, fileHash);
      continue;
    }

    const cssLinks = findStylesheetLinks(filePath, content, knownStyles);
    const seenChunks = new Set<string>();
    const uniqueChunks: Array<{ content: string; hash: string }> = [];
    for (const chunkContent of splitIntoChunks(content, filePath)) {
      const hash = await getHash(chunkContent);
      if (seenChunks.has(hash)) continue;
      seenChunks.add(hash);
      uniqueChunks.push({ content: chunkContent, hash });
    }
    if (uniqueChunks.length > MAX_INDEX_ITEMS - nextIndex.length) {
      skippedChunkCount += uniqueChunks.length;
      continue;
    }
    for (const chunk of uniqueChunks) {
      if (!extractor) throw new Error('[RAG] Embedding model is unavailable.');
      const output = await extractor(chunk.content, { pooling: 'mean', normalize: true });
      nextIndex.push({
        vector: toEmbeddingVector(output.data),
        filePath,
        content: chunk.content,
        hash: chunk.hash,
        fileHash,
        cssLinks,
        timestamp: Date.now(),
      });
    }
    nextFileHashes.set(filePath, fileHash);
  }

  const changed = !indexesMatch(index, nextIndex) || !mapsMatch(fileHashes, nextFileHashes);
  if (changed) await saveIndex(nextIndex, nextFileHashes);

  index = nextIndex;
  fileHashes = nextFileHashes;
  stylesheetContents = nextStylesheets;

  return {
    indexedFileCount: nextFileHashes.size,
    indexedChunkCount: nextIndex.length,
    skippedFileCount,
    skippedChunkCount,
  };
}

async function search({
  query,
  k = 5,
  device,
}: {
  query: string;
  k?: number;
  device?: RagInferenceDevice;
}): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  await init(device);
  if (!extractor) return [];

  const limit = Math.min(10, Math.max(1, Math.floor(Number.isFinite(k) ? k : 5)));
  let queryForEmbedding = query.trim();
  if (queryForEmbedding.length > MAX_QUERY_SOURCE_CHARS) {
    queryForEmbedding = queryForEmbedding.slice(-MAX_QUERY_SOURCE_CHARS);
  }
  const tokenLimit = effectiveTokenLimit();
  if (tokenCount(queryForEmbedding) > tokenLimit) {
    queryForEmbedding = queryForEmbedding
      .slice(earliestSuffixWithinTokenLimit(queryForEmbedding, tokenLimit))
      .trimStart();
  }
  if (!queryForEmbedding) return [];

  const output = await extractor(queryForEmbedding, { pooling: 'mean', normalize: true });
  return createSearchResults(toEmbeddingVector(output.data), limit);
}

self.addEventListener('message', async (event: MessageEvent) => {
  const { type, payload, id } = event.data as {
    type: string;
    payload: {
      filePath?: string;
      content?: string;
      files?: Record<string, string>;
      query?: string;
      k?: number;
      device?: RagInferenceDevice;
    };
    id: number;
  };

  try {
    if (type === 'INDEX_FILE') {
      await indexFile({
        filePath: payload.filePath || '',
        content: payload.content || '',
        device: payload.device,
      });
      self.postMessage({ id, type: 'INDEX_FILE_SUCCESS' });
    } else if (type === 'SYNC_WORKSPACE') {
      const summary = await syncWorkspace({
        files: payload.files || {},
        device: payload.device,
      });
      self.postMessage({ id, type: 'SYNC_WORKSPACE_SUCCESS', payload: summary });
    } else if (type === 'SEARCH') {
      const results = await search({
        query: payload.query || '',
        k: payload.k,
        device: payload.device,
      });
      self.postMessage({ id, type: 'SEARCH_SUCCESS', payload: results });
    } else if (type === 'UNLOAD_MODEL') {
      await disposeExtractor();
      self.postMessage({ id, type: 'UNLOAD_MODEL_SUCCESS' });
    } else if (type === 'PURGE_INDEX') {
      await saveIndex([], new Map());
      index = [];
      fileHashes = new Map();
      stylesheetContents = new Map();
      indexLoaded = true;
      await disposeExtractor();
      self.postMessage({ id, type: 'PURGE_INDEX_SUCCESS' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[RAG] Worker error:', error);
    self.postMessage({ id, type: 'ERROR', error: message });
  }
});

export const __testables = {
  loadTransformers,
  splitIntoChunks,
  extractSymbolHeader,
  resetTransformers() {
    transformersPromise = undefined;
  },
  async resetRuntime() {
    await disposeExtractor();
    webGPUUnavailable = false;
    index = [];
    fileHashes = new Map();
    stylesheetContents = new Map();
    indexLoaded = false;
  },
};
