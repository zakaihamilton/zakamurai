import {
  createCssContentMap,
  earliestSuffixWithinTokenLimit,
  findStylesheetLinks,
  splitIntoChunks,
} from './rag-chunker';
import {
  type RagInferenceDevice,
  disposeExtractor,
  effectiveTokenLimit,
  embedText,
  ensureExtractor,
  getExtractor,
  resetEmbedder,
  tokenCount,
} from './rag-embedder';
import {
  type LinkedCss,
  MAX_INDEX_ITEMS,
  type RagChunk,
  type SearchResult,
  type SyncSummary,
  getHash,
  indexesMatch,
  loadPersistedIndex,
  mapsMatch,
  savePersistedIndex,
} from './rag-storage';

const MAX_FILE_BYTES = 512 * 1024;
const MAX_QUERY_SOURCE_CHARS = 4000;
const MIN_SEARCH_SCORE = 0.2;
const MAX_RESULTS_PER_FILE = 2;
const MAX_LINKED_CSS_CHARS = 8000;

let index: RagChunk[] = [];
let fileHashes = new Map<string, string>();
let stylesheetContents = new Map<string, string>();
let indexLoaded = false;

async function init(device: RagInferenceDevice = 'webgpu'): Promise<void> {
  await ensureExtractor(device);
  if (!indexLoaded) {
    const loaded = await loadPersistedIndex();
    index = loaded.chunks;
    fileHashes = loaded.fileHashes;
    indexLoaded = true;
  }
}

function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  if (left.length === 0 || left.length !== right.length) return -1;
  let dotProduct = 0;
  for (let i = 0; i < left.length; i++) {
    dotProduct += left[i] * right[i];
  }
  return Number.isFinite(dotProduct) ? dotProduct : -1;
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

async function buildUniqueChunks(content: string, filePath: string) {
  const seen = new Set<string>();
  const uniqueChunks: Array<{ content: string; hash: string }> = [];
  for (const chunkContent of splitIntoChunks(content, filePath)) {
    const hash = await getHash(chunkContent);
    if (seen.has(hash)) continue;
    seen.add(hash);
    uniqueChunks.push({ content: chunkContent, hash });
  }
  return uniqueChunks;
}

export async function indexFile({
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
    await savePersistedIndex(nextIndex, nextFileHashes);
    index = nextIndex;
    fileHashes = nextFileHashes;
    stylesheetContents.delete(filePath);
    return;
  }

  const fileHash = await getHash(content);
  const uniqueChunks = await buildUniqueChunks(content, filePath);
  const cssLinks = findStylesheetLinks(filePath, content, new Set(stylesheetContents.keys()));

  const hasCapacity = nextIndex.length + uniqueChunks.length <= MAX_INDEX_ITEMS;
  if (hasCapacity) {
    for (const chunk of uniqueChunks) {
      nextIndex.push({
        vector: await embedText(chunk.content),
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

  await savePersistedIndex(nextIndex, nextFileHashes);
  index = nextIndex;
  fileHashes = nextFileHashes;
  if (filePath.toLowerCase().endsWith('.css')) stylesheetContents.set(filePath, content);
}

export async function syncWorkspace({
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
    const uniqueChunks = await buildUniqueChunks(content, filePath);
    if (uniqueChunks.length > MAX_INDEX_ITEMS - nextIndex.length) {
      skippedChunkCount += uniqueChunks.length;
      continue;
    }
    for (const chunk of uniqueChunks) {
      nextIndex.push({
        vector: await embedText(chunk.content),
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
  if (changed) await savePersistedIndex(nextIndex, nextFileHashes);

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

export async function search({
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
  if (!getExtractor()) return [];

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

  return createSearchResults(await embedText(queryForEmbedding), limit);
}

export async function purgeIndex(): Promise<void> {
  await savePersistedIndex([], new Map());
  index = [];
  fileHashes = new Map();
  stylesheetContents = new Map();
  indexLoaded = true;
  await disposeExtractor();
}

export async function resetSearchRuntime(): Promise<void> {
  await resetEmbedder();
  index = [];
  fileHashes = new Map();
  stylesheetContents = new Map();
  indexLoaded = false;
}
