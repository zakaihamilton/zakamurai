import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockStorageManager, setMockNavigator } from '@/test-utils/domMocks';
import { RAG_MODEL_ID } from './rag-embedder';
import {
  getHash,
  indexesMatch,
  loadPersistedIndex,
  MAX_INDEX_ITEMS,
  mapsMatch,
  type RagChunk,
  savePersistedIndex,
} from './rag-storage';

function makeVector(seed = 0.5): Float32Array {
  const vec = new Float32Array(384);
  vec.fill(seed);
  return vec;
}

function makeChunk(overrides: Partial<RagChunk> = {}): RagChunk {
  return {
    vector: makeVector(),
    filePath: 'src/App.tsx',
    content: 'export function App() {}',
    hash: 'chunk-hash-1',
    fileHash: 'file-hash-1',
    cssLinks: ['src/App.css'],
    timestamp: 1000,
    ...overrides,
  };
}

describe('rag-storage', () => {
  let originalNavigator: Navigator;

  beforeEach(() => {
    originalNavigator = globalThis.navigator;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setMockNavigator(originalNavigator);
    vi.restoreAllMocks();
  });

  describe('getHash', () => {
    it('returns a 64-character lowercase SHA-256 hex digest', async () => {
      const hashA = await getHash('hello world');
      const hashB = await getHash('hello world');
      const hashC = await getHash('hello world!');
      expect(hashA).toMatch(/^[0-9a-f]{64}$/);
      expect(hashA).toBe(hashB);
      expect(hashA).not.toBe(hashC);
    });
  });

  describe('mapsMatch', () => {
    it('returns true for identical maps and false on size or value mismatch', () => {
      const a = new Map([
        ['a.ts', '1'],
        ['b.ts', '2'],
      ]);
      const b = new Map([
        ['a.ts', '1'],
        ['b.ts', '2'],
      ]);
      const diffSize = new Map([['a.ts', '1']]);
      const diffVal = new Map([
        ['a.ts', '1'],
        ['b.ts', '999'],
      ]);
      const diffKey = new Map([
        ['a.ts', '1'],
        ['c.ts', '2'],
      ]);

      expect(mapsMatch(a, b)).toBe(true);
      expect(mapsMatch(a, diffSize)).toBe(false);
      expect(mapsMatch(a, diffVal)).toBe(false);
      expect(mapsMatch(a, diffKey)).toBe(false);
    });
  });

  describe('indexesMatch', () => {
    it('compares chunk length and all structural fields', () => {
      const base = [makeChunk()];
      expect(indexesMatch(base, [makeChunk()])).toBe(true);
      expect(indexesMatch(base, [])).toBe(false);
      expect(indexesMatch(base, [makeChunk({ filePath: 'src/Other.tsx' })])).toBe(false);
      expect(indexesMatch(base, [makeChunk({ fileHash: 'other' })])).toBe(false);
      expect(indexesMatch(base, [makeChunk({ hash: 'other' })])).toBe(false);
      expect(indexesMatch(base, [makeChunk({ content: 'other' })])).toBe(false);
      expect(indexesMatch(base, [makeChunk({ cssLinks: ['src/Other.css'] })])).toBe(false);
    });
  });

  describe('loadPersistedIndex', () => {
    function setupPersistedText(text: string) {
      const getFileHandle = vi.fn(async () => ({
        getFile: async () => ({
          text: async () => text,
        }),
      }));
      setMockNavigator({
        ...originalNavigator,
        storage: mockStorageManager({
          getDirectory: vi.fn(async () => ({
            getFileHandle,
          })) as unknown as StorageManager['getDirectory'],
        }),
      } as Navigator);
      return getFileHandle;
    }

    it('returns empty chunks and fileHashes when persisted file is empty', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      setupPersistedText('');

      const result = await loadPersistedIndex();
      expect(result.chunks).toEqual([]);
      expect(result.fileHashes.size).toBe(0);
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('loads valid persisted chunks and fileHashes from OPFS', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const vector = Array.from({ length: 384 }, (_, i) => i / 384);
      setupPersistedText(
        JSON.stringify({
          schemaVersion: 3,
          modelId: RAG_MODEL_ID,
          chunks: [
            {
              filePath: 'src/App.tsx',
              content: 'export function App() {}',
              hash: 'c1',
              fileHash: 'f1',
              cssLinks: ['src/App.css'],
              timestamp: 123,
              vector,
            },
          ],
          fileHashes: [['src/App.tsx', 'f1']],
        }),
      );

      const result = await loadPersistedIndex();
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].vector).toBeInstanceOf(Float32Array);
      expect(result.chunks[0].vector).toHaveLength(384);
      expect(result.fileHashes.get('src/App.tsx')).toBe('f1');
      expect(logSpy).toHaveBeenCalledWith('[RAG] Loaded 1 chunks from OPFS.');
    });

    it('ignores persisted payload with mismatched schemaVersion or modelId', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      setupPersistedText(
        JSON.stringify({
          schemaVersion: 2,
          modelId: RAG_MODEL_ID,
          chunks: [],
          fileHashes: [],
        }),
      );

      const wrongVersion = await loadPersistedIndex();
      expect(wrongVersion.chunks).toEqual([]);

      setupPersistedText(
        JSON.stringify({
          schemaVersion: 3,
          modelId: 'other-model',
          chunks: [],
          fileHashes: [],
        }),
      );
      const wrongModel = await loadPersistedIndex();
      expect(wrongModel.chunks).toEqual([]);
    });

    it('warns and rebuilds on invalid JSON', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      setupPersistedText('{not-valid-json');

      const result = await loadPersistedIndex();
      expect(result.chunks).toEqual([]);
      expect(result.fileHashes.size).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        '[RAG] Stored index is invalid and will be rebuilt:',
        expect.any(SyntaxError),
      );
    });

    it('warns and rebuilds when chunk entries or fileHashes are invalid', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const validVector = Array.from({ length: 384 }, () => 0.1);

      // Invalid vector length
      setupPersistedText(
        JSON.stringify({
          schemaVersion: 3,
          modelId: RAG_MODEL_ID,
          chunks: [
            {
              filePath: 'a.ts',
              content: 'x',
              hash: 'h',
              fileHash: 'fh',
              cssLinks: [],
              timestamp: 1,
              vector: [0.1],
            },
          ],
          fileHashes: [['a.ts', 'fh']],
        }),
      );
      expect((await loadPersistedIndex()).chunks).toEqual([]);

      // Invalid fileHashes entry
      setupPersistedText(
        JSON.stringify({
          schemaVersion: 3,
          modelId: RAG_MODEL_ID,
          chunks: [
            {
              filePath: 'a.ts',
              content: 'x',
              hash: 'h',
              fileHash: 'fh',
              cssLinks: [],
              timestamp: 1,
              vector: validVector,
            },
          ],
          fileHashes: [['a.ts', 123]],
        }),
      );
      expect((await loadPersistedIndex()).chunks).toEqual([]);

      // Mismatched chunk fileHash vs fileHashes map
      setupPersistedText(
        JSON.stringify({
          schemaVersion: 3,
          modelId: RAG_MODEL_ID,
          chunks: [
            {
              filePath: 'a.ts',
              content: 'x',
              hash: 'h',
              fileHash: 'fh-stale',
              cssLinks: [],
              timestamp: 1,
              vector: validVector,
            },
          ],
          fileHashes: [['a.ts', 'fh-current']],
        }),
      );
      expect((await loadPersistedIndex()).chunks).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(3);
    });

    it('warns and rebuilds when persisted chunk count exceeds MAX_INDEX_ITEMS', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const validVector = Array.from({ length: 384 }, () => 0.1);
      const chunks = Array.from({ length: MAX_INDEX_ITEMS + 1 }, (_, i) => ({
        filePath: 'a.ts',
        content: `x-${i}`,
        hash: `h-${i}`,
        fileHash: 'fh',
        cssLinks: [],
        timestamp: 1,
        vector: validVector,
      }));
      setupPersistedText(
        JSON.stringify({
          schemaVersion: 3,
          modelId: RAG_MODEL_ID,
          chunks,
          fileHashes: [['a.ts', 'fh']],
        }),
      );

      const result = await loadPersistedIndex();
      expect(result.chunks).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        '[RAG] Stored index is invalid and will be rebuilt:',
        expect.objectContaining({ message: 'Stored RAG index exceeds the configured size limit.' }),
      );
    });
  });

  describe('savePersistedIndex', () => {
    it('serializes chunks and fileHashes and closes the writable stream', async () => {
      const write = vi.fn<(data: string) => Promise<void>>(async () => {});
      const close = vi.fn(async () => {});
      const abort = vi.fn(async () => {});
      setMockNavigator({
        ...originalNavigator,
        storage: mockStorageManager({
          getDirectory: vi.fn(async () => ({
            getFileHandle: vi.fn(async () => ({
              createWritable: vi.fn(async () => ({ write, close, abort })),
            })),
          })) as unknown as StorageManager['getDirectory'],
        }),
      } as Navigator);

      const chunk = makeChunk();
      const fileHashes = new Map([['src/App.tsx', 'file-hash-1']]);
      await savePersistedIndex([chunk], fileHashes);

      expect(write).toHaveBeenCalledTimes(1);
      const writtenJson = JSON.parse(write.mock.calls[0][0]);
      expect(writtenJson.schemaVersion).toBe(3);
      expect(writtenJson.modelId).toBe(RAG_MODEL_ID);
      expect(writtenJson.chunks[0].vector).toHaveLength(384);
      expect(writtenJson.fileHashes).toEqual([['src/App.tsx', 'file-hash-1']]);
      expect(close).toHaveBeenCalledTimes(1);
      expect(abort).not.toHaveBeenCalled();
    });

    it('aborts writable stream and rethrows when write or close fails (even if abort rejects)', async () => {
      const writeError = new Error('disk full');
      const write = vi.fn(async () => {
        throw writeError;
      });
      const close = vi.fn(async () => {});
      const abort = vi.fn(async () => {
        throw new Error('abort failed');
      });

      setMockNavigator({
        ...originalNavigator,
        storage: mockStorageManager({
          getDirectory: vi.fn(async () => ({
            getFileHandle: vi.fn(async () => ({
              createWritable: vi.fn(async () => ({ write, close, abort })),
            })),
          })) as unknown as StorageManager['getDirectory'],
        }),
      } as Navigator);

      await expect(savePersistedIndex([makeChunk()], new Map())).rejects.toThrow('disk full');
      expect(abort).toHaveBeenCalledTimes(1);
      expect(close).not.toHaveBeenCalled();
    });
  });
});
