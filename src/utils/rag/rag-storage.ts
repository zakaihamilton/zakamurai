import { RAG_MODEL_ID } from './rag-embedder';

export type LinkedCss = {
  filePath: string;
  content: string;
};

export type RagChunk = {
  vector: Float32Array;
  filePath: string;
  content: string;
  hash: string;
  fileHash: string;
  cssLinks: string[];
  timestamp: number;
};

export type SearchResult = {
  filePath: string;
  content: string;
  hash: string;
  timestamp: number;
  score: number;
  linkedCss: LinkedCss[];
};

export type SyncSummary = {
  indexedFileCount: number;
  indexedChunkCount: number;
  skippedFileCount: number;
  skippedChunkCount: number;
};

type PersistedIndex = {
  schemaVersion: number;
  modelId: string;
  chunks: Array<Omit<RagChunk, 'vector'> & { vector: number[] }>;
  fileHashes: Array<[string, string]>;
};

const INDEX_SCHEMA_VERSION = 3;
const DB_NAME = 'zakamurai-rag-data.json';
export const MAX_INDEX_ITEMS = 1500;

export async function getHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function mapsMatch(left: Map<string, string>, right: Map<string, string>): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }
  return true;
}

export function indexesMatch(left: RagChunk[], right: RagChunk[]): boolean {
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

export async function loadPersistedIndex(): Promise<{
  chunks: RagChunk[];
  fileHashes: Map<string, string>;
}> {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(DB_NAME, { create: true });
  const file = await fileHandle.getFile();
  const text = await file.text();

  let chunks: RagChunk[] = [];
  let fileHashes = new Map<string, string>();
  if (!text) {
    return { chunks, fileHashes };
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
      chunks = persisted.chunks.slice(-MAX_INDEX_ITEMS).map((item) => ({
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

  console.log(`[RAG] Loaded ${chunks.length} chunks from OPFS.`);
  return { chunks, fileHashes };
}

export async function savePersistedIndex(
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
