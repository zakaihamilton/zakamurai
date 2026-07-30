// src/utils/rag/indexer-controller.ts
import { isWebLLMGpuMemoryReserved } from '@/utils/ai-memory-governor';

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type WorkerMessage = {
  id: number;
  type: string;
  payload?: unknown;
  error?: string;
};

export type RagInferenceDevice = 'webgpu' | 'wasm';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const INDEX_REQUEST_TIMEOUT_MS = 120_000;
const UNLOAD_REQUEST_TIMEOUT_MS = 10_000;

export type FileSystemObserverRecord = {
  type: string;
  changedHandle: FileSystemHandle;
  relativePathComponents?: string[];
  root?: FileSystemDirectoryHandle;
};

declare global {
  interface Window {
    FileSystemObserver?: new (
      callback: (records: FileSystemObserverRecord[]) => void,
    ) => {
      observe: (root: FileSystemDirectoryHandle, options: { recursive: boolean }) => Promise<void>;
      disconnect: () => void;
    };
  }
}

export class IndexerController {
  worker: Worker | null;
  observer: {
    observe: (root: FileSystemDirectoryHandle, options: { recursive: boolean }) => Promise<void>;
    disconnect: () => void;
  } | null;
  debouncerMap: Map<string, ReturnType<typeof setTimeout>>;
  DEBOUNCE_MS: number;
  msgId: number;
  resolvers: Map<number, PendingResolver>;
  initPromise: Promise<void> | null;
  enableOpfsObserver: boolean;

  constructor({ enableOpfsObserver = false }: { enableOpfsObserver?: boolean } = {}) {
    this.worker = null;
    this.observer = null;
    this.debouncerMap = new Map();
    this.DEBOUNCE_MS = 750;
    this.msgId = 0;
    this.resolvers = new Map();
    this.initPromise = null;
    this.enableOpfsObserver = enableOpfsObserver;
  }

  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initialize().catch((error) => {
      this.initPromise = null;
      throw error;
    });
    return this.initPromise;
  }

  async initialize(): Promise<void> {
    const worker = new Worker(new URL('./rag-worker.tsx', import.meta.url), {
      type: 'module',
    });
    this.worker = worker;

    worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
      const { id, type, payload, error } = event.data;
      if (this.resolvers.has(id)) {
        const resolver = this.resolvers.get(id);
        if (!resolver) return;
        const { resolve, reject, timeout } = resolver;
        clearTimeout(timeout);
        if (type === 'ERROR') {
          reject(new Error(error));
        } else {
          resolve(payload);
        }
        this.resolvers.delete(id);
      } else if (type === 'ERROR') {
        console.error('[IndexerController] Worker Error:', error);
      }
    });
    worker.addEventListener('error', (event: ErrorEvent) => {
      this.failWorker(new Error(event.message || '[IndexerController] RAG worker crashed'), worker);
    });
    worker.addEventListener('messageerror', () => {
      this.failWorker(
        new Error('[IndexerController] RAG worker message could not be decoded'),
        worker,
      );
    });

    if (this.enableOpfsObserver && !this.observer) {
      try {
        const root = await navigator.storage.getDirectory();
        if (typeof window.FileSystemObserver === 'function') {
          this.observer = new window.FileSystemObserver(this.handleFileChanges.bind(this));
          await this.observer.observe(root, { recursive: true });
          console.log('[IndexerController] FileSystemObserver initialized on OPFS root.');
        }
      } catch (e) {
        console.error('[IndexerController] Error initializing OPFS or FileSystemObserver:', e);
      }
    }
  }

  private failWorker(error: Error, expectedWorker = this.worker): void {
    if (expectedWorker && expectedWorker !== this.worker) return;

    expectedWorker?.terminate();
    if (this.worker === expectedWorker) {
      this.worker = null;
      this.initPromise = null;
    }

    for (const { reject, timeout } of this.resolvers.values()) {
      clearTimeout(timeout);
      reject(error);
    }
    this.resolvers.clear();
  }

  private requestTimeout(type: string): number {
    if (type === 'INDEX_FILE') return INDEX_REQUEST_TIMEOUT_MS;
    if (type === 'UNLOAD_MODEL') return UNLOAD_REQUEST_TIMEOUT_MS;
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  sendMessage(
    type: string,
    payload: unknown,
    timeoutMs = this.requestTimeout(type),
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const worker = this.worker;
      if (!worker) {
        reject(new Error('[IndexerController] RAG worker is not initialized'));
        return;
      }

      const id = ++this.msgId;
      const timeout = setTimeout(() => {
        this.failWorker(
          new Error(`[IndexerController] ${type} request timed out after ${timeoutMs}ms`),
          worker,
        );
      }, timeoutMs);
      this.resolvers.set(id, { resolve, reject, timeout });

      try {
        worker.postMessage({ id, type, payload });
      } catch (error) {
        this.failWorker(
          error instanceof Error
            ? error
            : new Error(`[IndexerController] Failed to send ${type} request`),
          worker,
        );
      }
    });
  }

  async handleFileChanges(records: FileSystemObserverRecord[]): Promise<void> {
    for (const record of records) {
      if (record.type === 'appeared' || record.type === 'modified') {
        let filePath = record.changedHandle.name;
        if (record.relativePathComponents) {
          filePath = record.relativePathComponents.join('/');
        } else if (record.root?.resolve) {
          const pathArr = await record.root.resolve(record.changedHandle);
          if (pathArr) filePath = pathArr.join('/');
        }

        if (
          (filePath.includes('.') && filePath.startsWith('.')) ||
          filePath.includes('/.') ||
          record.changedHandle.kind !== 'file'
        ) {
          continue;
        }

        if (this.debouncerMap.has(filePath)) {
          clearTimeout(this.debouncerMap.get(filePath));
        }

        const timeout = setTimeout(() => {
          this.processFile(record.changedHandle as FileSystemFileHandle, filePath);
          this.debouncerMap.delete(filePath);
        }, this.DEBOUNCE_MS);

        this.debouncerMap.set(filePath, timeout);
      }
    }
  }

  async getFullPath(
    handle: FileSystemHandle,
    directoryHandle?: FileSystemDirectoryHandle | null,
  ): Promise<string> {
    if (directoryHandle) {
      const pathArray = await directoryHandle.resolve(handle);
      if (pathArray) {
        return pathArray.join('/');
      }
    }
    return handle.name;
  }

  async processFile(fileHandle: FileSystemFileHandle, filePath: string): Promise<void> {
    try {
      const file = await fileHandle.getFile();
      const content = await file.text();

      console.log(`[IndexerController] Indexing ${filePath}...`);
      if (!this.worker) {
        await this.init();
      }
      await this.sendMessage('INDEX_FILE', {
        filePath,
        content,
        device: isWebLLMGpuMemoryReserved() ? 'wasm' : 'webgpu',
      });
      console.log(`[IndexerController] Successfully indexed ${filePath}.`);
    } catch (e) {
      console.error(`[IndexerController] Error processing file ${filePath}:`, e);
    }
  }

  async indexFile(
    filePath: string,
    content: string,
    device: RagInferenceDevice = 'webgpu',
  ): Promise<unknown> {
    if (!this.worker) {
      await this.init();
    }
    return this.sendMessage('INDEX_FILE', {
      filePath,
      content: String(content ?? ''),
      device,
    });
  }

  async indexWorkspaceFiles(
    files: Record<string, string> = {},
    device: RagInferenceDevice = 'webgpu',
  ): Promise<number> {
    if (!this.worker) {
      await this.init();
    }
    const entries = Object.entries(files);
    for (const [filePath, content] of entries) {
      if (typeof content !== 'string') continue;
      try {
        await this.sendMessage('INDEX_FILE', { filePath, content, device });
      } catch (e) {
        console.error(`[IndexerController] Failed to index ${filePath}:`, e);
      }
    }
    return entries.length;
  }

  async search(query: string, k = 5, device: RagInferenceDevice = 'webgpu'): Promise<unknown> {
    if (!this.worker) {
      await this.init();
    }
    return this.sendMessage('SEARCH', { query, k, device });
  }

  async unloadModel(): Promise<unknown> {
    if (!this.worker) return;
    return this.sendMessage('UNLOAD_MODEL', {});
  }

  async purgeIndex(): Promise<unknown> {
    if (!this.worker) return;
    return this.sendMessage('PURGE_INDEX', {});
  }

  dispose(): void {
    if (this.observer?.disconnect) {
      this.observer.disconnect();
    }

    for (const timeout of this.debouncerMap.values()) {
      clearTimeout(timeout);
    }

    this.failWorker(new Error('[IndexerController] Disposed'));
    this.observer = null;
    this.debouncerMap.clear();
  }
}
