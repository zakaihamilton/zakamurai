import { IndexerController } from './indexer-controller';

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

export class RagSearchUtility {
  controller: IndexerController;
  isInitialized: boolean;

  constructor() {
    this.controller = new IndexerController();
    this.isInitialized = false;
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

    const rawResults = (await this.controller.search(query, k)) as RawSearchResult[];
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
    return this.controller.indexWorkspaceFiles(files);
  }

  async indexFile(filePath: string, content: string): Promise<unknown> {
    await this.init();
    return this.controller.indexFile(filePath, content);
  }

  async unloadModel(): Promise<unknown> {
    if (!this.isInitialized) return;
    return this.controller.unloadModel();
  }

  async purgeIndex(): Promise<unknown> {
    if (!this.isInitialized) return;
    return this.controller.purgeIndex();
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
