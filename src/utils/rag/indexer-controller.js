// src/utils/rag/indexer-controller.js

export class IndexerController {
  constructor() {
    this.worker = null;
    this.observer = null;
    this.debouncerMap = new Map();
    this.DEBOUNCE_MS = 750; // Leaky bucket debounce duration
    this.msgId = 0;
    this.resolvers = new Map();
  }

  async init() {
    // 1. Initialize Worker
    this.worker = new Worker(new URL('./rag-worker.js', import.meta.url), {
      type: 'module',
    });

    this.worker.addEventListener('message', (event) => {
      const { id, type, payload, error } = event.data;
      if (this.resolvers.has(id)) {
        const { resolve, reject } = this.resolvers.get(id);
        if (type === 'ERROR') {
          reject(new Error(error));
        } else {
          resolve(payload);
        }
        this.resolvers.delete(id);
      } else {
        if (type === 'ERROR') {
          console.error('[IndexerController] Worker Error:', error);
        }
      }
    });

    // 2. Setup FileSystemObserver on OPFS root
    try {
      const root = await navigator.storage.getDirectory();

      // Fallback or explicit check if FileSystemObserver is available
      if ('FileSystemObserver' in window) {
        this.observer = new window.FileSystemObserver(this.handleFileChanges.bind(this));
        await this.observer.observe(root, { recursive: true });
        console.log('[IndexerController] FileSystemObserver initialized on OPFS root.');
      } else {
        console.warn(
          '[IndexerController] FileSystemObserver is not supported in this browser. RAG auto-indexing disabled.',
        );
      }
    } catch (e) {
      console.error('[IndexerController] Error initializing OPFS or FileSystemObserver:', e);
    }
  }

  sendMessage(type, payload) {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.resolvers.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
    });
  }

  async handleFileChanges(records) {
    for (const record of records) {
      if (record.type === 'appeared' || record.type === 'modified') {
        // Debounce logic for file changes
        // Since we don't have the root handle easily accessible here without state,
        // we'll rely on the relative path logic for the prototype, or assume the record
        // provides relativePaths if using a standard polyfill/implementation
        let filePath = record.changedHandle.name;
        if (record.relativePathComponents) {
          filePath = record.relativePathComponents.join('/');
        } else if (record.root?.resolve) {
          const pathArr = await record.root.resolve(record.changedHandle);
          if (pathArr) filePath = pathArr.join('/');
        }

        // Skip hidden files or directories if needed
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
          this.processFile(record.changedHandle, filePath);
          this.debouncerMap.delete(filePath);
        }, this.DEBOUNCE_MS);

        this.debouncerMap.set(filePath, timeout);
      }
    }
  }

  async getFullPath(handle, directoryHandle) {
    // In OPFS, FileSystemObserver provides a path array in the record
    // We should resolve the full path if possible
    if (directoryHandle) {
      const pathArray = await directoryHandle.resolve(handle);
      if (pathArray) {
        return pathArray.join('/');
      }
    }
    return handle.name;
  }

  async processFile(fileHandle, filePath) {
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

  async search(query, k = 5) {
    if (!this.worker) {
      throw new Error('[IndexerController] Worker not initialized');
    }
    return this.sendMessage('SEARCH', { query, k });
  }
}
