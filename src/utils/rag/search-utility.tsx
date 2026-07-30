import { isWebLLMGpuMemoryReserved } from '@/utils/ai-memory-governor';
import { IndexerController, type RagInferenceDevice } from './indexer-controller';

type LinkedCss = {
  filePath: string;
  content: string;
};

type ContextItem = {
  filePath: string;
  content: string;
  score: number;
  linkedCss: LinkedCss[];
  cssLinks?: string;
};

type RawSearchResult = {
  filePath: string;
  content: string;
  score?: number;
  cssLinks?: string;
};

export const RAG_EXTRACTOR_IDLE_UNLOAD_MS = 15_000;

export class RagSearchUtility {
  controller: IndexerController;
  isInitialized: boolean;
  operationQueue: Promise<void>;
  unloadTimer: ReturnType<typeof setTimeout> | null;

  constructor() {
    this.controller = new IndexerController();
    this.isInitialized = false;
    this.operationQueue = Promise.resolve();
    this.unloadTimer = null;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.operationQueue.then(operation, operation);
    this.operationQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  private inferenceDevice(): RagInferenceDevice {
    return isWebLLMGpuMemoryReserved() ? 'wasm' : 'webgpu';
  }

  private clearUnloadTimer(): void {
    if (!this.unloadTimer) return;
    clearTimeout(this.unloadTimer);
    this.unloadTimer = null;
  }

  private scheduleExtractorUnload(): void {
    this.clearUnloadTimer();
    this.unloadTimer = setTimeout(() => {
      this.unloadTimer = null;
      void this.enqueue(() => this.controller.unloadModel()).catch((error) => {
        console.warn('[RAG] Failed to release idle inference model:', error);
      });
    }, RAG_EXTRACTOR_IDLE_UNLOAD_MS);
  }

  private withTransientExtractor<T>(
    operation: (device: RagInferenceDevice) => Promise<T>,
  ): Promise<T> {
    return this.enqueue(async () => {
      this.clearUnloadTimer();
      try {
        return await operation(this.inferenceDevice());
      } finally {
        this.scheduleExtractorUnload();
      }
    });
  }

  async init(): Promise<void> {
    if (!this.isInitialized) {
      await this.controller.init();
      this.isInitialized = true;
    }
  }

  async _readOpfsFile(filePath: string): Promise<string | null> {
    try {
      const root = await navigator.storage.getDirectory();
      const parts = filePath.split('/').filter((p) => p !== '' && p !== '.');
      let currentDir = root;

      for (let i = 0; i < parts.length - 1; i++) {
        if (parts[i] === '..') {
          continue;
        }
        currentDir = await currentDir.getDirectoryHandle(parts[i]);
      }

      const fileName = parts[parts.length - 1];
      const fileHandle = await currentDir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (e) {
      console.warn(`[RagSearchUtility] Could not read linked file ${filePath} from OPFS:`, e);
      return null;
    }
  }

  async retrieveContext(query: string, k = 5): Promise<ContextItem[]> {
    await this.init();

    const rawResults = (await this.withTransientExtractor((device) =>
      this.controller.search(query, k, device),
    )) as RawSearchResult[];
    const enrichedResults: ContextItem[] = [];

    for (const result of rawResults) {
      const item: ContextItem = {
        filePath: result.filePath,
        content: result.content,
        score: result.score || 0,
        linkedCss: [],
      };

      if (result.cssLinks) {
        try {
          const links = JSON.parse(result.cssLinks) as string[];
          for (const cssPath of links) {
            let resolvePath = cssPath;
            if (resolvePath.startsWith('./')) {
              resolvePath = resolvePath.substring(2);
            }
            const cssContent = await this._readOpfsFile(resolvePath);
            if (cssContent) {
              item.linkedCss.push({
                filePath: resolvePath,
                content: cssContent,
              });
            }
          }
        } catch (e) {
          console.error(`[RagSearchUtility] Error parsing cssLinks for ${result.filePath}:`, e);
        }
      }

      enrichedResults.push(item);
    }

    return enrichedResults;
  }

  async indexWorkspaceFiles(files: Record<string, string> = {}): Promise<number> {
    await this.init();
    return this.withTransientExtractor((device) =>
      this.controller.indexWorkspaceFiles(files, device),
    );
  }

  async indexFile(filePath: string, content: string): Promise<unknown> {
    await this.init();
    return this.withTransientExtractor((device) =>
      this.controller.indexFile(filePath, content, device),
    );
  }

  async unloadModel(): Promise<unknown> {
    this.clearUnloadTimer();
    if (!this.isInitialized) return;
    return this.enqueue(() => this.controller.unloadModel());
  }

  forceUnloadModel(): void {
    this.clearUnloadTimer();
    this.controller.dispose();
    this.operationQueue = Promise.resolve();
    this.isInitialized = false;
  }

  async purgeIndex(): Promise<unknown> {
    this.clearUnloadTimer();
    if (!this.isInitialized) return;
    return this.enqueue(() => this.controller.purgeIndex());
  }

  formatPromptContext(results: ContextItem[]): string {
    if (!results || results.length === 0) {
      return '';
    }

    let promptContext = '### Code Context from Workspace:\n\n';

    for (const result of results) {
      promptContext += `--- File: ${result.filePath} ---\n`;
      promptContext += `${result.content}\n\n`;

      for (const cssFile of result.linkedCss) {
        promptContext += `--- Linked CSS: ${cssFile.filePath} ---\n`;
        promptContext += `${cssFile.content}\n\n`;
      }
    }

    promptContext += '### End Code Context\n\n';
    return promptContext;
  }
}

export const ragSearch = new RagSearchUtility();
