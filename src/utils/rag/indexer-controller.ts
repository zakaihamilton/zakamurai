// src/utils/rag/indexer-controller.ts

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type WorkerMessage = {
  id: number;
  type: string;
  payload?: unknown;
  error?: string;
};

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

    this.initPromise = this.initialize();
    return this.initPromise;
  }

  async initialize(): Promise<void> {
    this.worker = new Worker(new URL('./rag-worker.tsx', import.meta.url), {
      type: 'module',
    });

    this.worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
      const { id, type, payload, error } = event.data;
      if (this.resolvers.has(id)) {
        const resolver = this.resolvers.get(id);
        if (!resolver) return;
        const { resolve, reject } = resolver;
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

    if (this.enableOpfsObserver) {
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

  sendMessage(type: string, payload: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.resolvers.set(id, { resolve, reject });
      this.worker?.postMessage({ id, type, payload });
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
      await this.sendMessage('INDEX_FILE', { filePath, content });
      console.log(`[IndexerController] Successfully indexed ${filePath}.`);
    } catch (e) {
      console.error(`[IndexerController] Error processing file ${filePath}:`, e);
    }
  }

  async indexFile(filePath: string, content: string): Promise<unknown> {
    if (!this.worker) {
      await this.init();
    }
    return this.sendMessage('INDEX_FILE', { filePath, content: String(content ?? '') });
  }

  async indexWorkspaceFiles(files: Record<string, string> = {}): Promise<number> {
    if (!this.worker) {
      await this.init();
    }
    const entries = Object.entries(files);
    for (const [filePath, content] of entries) {
      if (typeof content !== 'string') continue;
      try {
        await this.sendMessage('INDEX_FILE', { filePath, content });
      } catch (e) {
        console.error(`[IndexerController] Failed to index ${filePath}:`, e);
      }
    }
    return entries.length;
  }

  async search(query: string, k = 5): Promise<unknown> {
    if (!this.worker) {
      await this.init();
    }
    return this.sendMessage('SEARCH', { query, k });
  }

  dispose(): void {
    if (this.observer?.disconnect) {
      this.observer.disconnect();
    }

    for (const timeout of this.debouncerMap.values()) {
      clearTimeout(timeout);
    }

    for (const { reject } of this.resolvers.values()) {
      reject(new Error('[IndexerController] Disposed'));
    }

    this.worker?.terminate();
    this.worker = null;
    this.observer = null;
    this.debouncerMap.clear();
    this.resolvers.clear();
    this.initPromise = null;
  }
}
