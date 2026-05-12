// src/utils/rag/search-utility.js
import { IndexerController } from './indexer-controller.js';

export class RagSearchUtility {
  constructor() {
    this.controller = new IndexerController();
    this.isInitialized = false;
  }

  async init() {
    if (!this.isInitialized) {
      await this.controller.init();
      this.isInitialized = true;
    }
  }

  /**
   * Reads a file from OPFS to resolve CSS Module Context Linking.
   * This is a utility function to be used internally by the search method.
   */
  async _readOpfsFile(filePath) {
    try {
      const root = await navigator.storage.getDirectory();
      const parts = filePath.split('/').filter((p) => p !== '' && p !== '.');
      let currentDir = root;

      for (let i = 0; i < parts.length - 1; i++) {
        if (parts[i] === '..') {
          // Cannot easily resolve `..` going above root in OPFS securely without tracking full path.
          // Simplified handling for prototype: just skip or handle via known context if needed.
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

  /**
   * Search for context and dynamically inject linked CSS modules.
   * @param {string} query - The user's prompt or search query.
   * @param {number} k - Number of chunks to retrieve.
   * @returns {Promise<Array>} List of context items, including resolved CSS blocks.
   */
  async retrieveContext(query, k = 5) {
    await this.init();

    const rawResults = await this.controller.search(query, k);
    const enrichedResults = [];

    for (const result of rawResults) {
      const item = {
        filePath: result.filePath,
        content: result.content,
        score: result.score || 0,
        linkedCss: [],
      };

      // Context Linking Resolution
      if (result.cssLinks) {
        try {
          const links = JSON.parse(result.cssLinks);
          for (const cssPath of links) {
            // Attempt to resolve the imported CSS path relative to the JS file
            // Since this is a prototype, we just read the name or simplistic path
            // Real implementation would resolve `cssPath` relative to `result.filePath`
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

  /**
   * Formats retrieved context blocks into a string suitable for injection into an LLM prompt.
   * @param {Array} results - The output from `retrieveContext`.
   * @returns {string} Formatted context block.
   */
  formatPromptContext(results) {
    if (!results || results.length === 0) {
      return '';
    }

    let promptContext = '### Code Context from Workspace:\n\n';

    for (const result of results) {
      promptContext += `--- File: ${result.filePath} ---\n`;
      promptContext += `${result.content}\n\n`;

      // Inject linked CSS directly beneath the importing component
      for (const cssFile of result.linkedCss) {
        promptContext += `--- Linked CSS: ${cssFile.filePath} ---\n`;
        promptContext += `${cssFile.content}\n\n`;
      }
    }

    promptContext += '### End Code Context\n\n';
    return promptContext;
  }
}

// Export a singleton instance for ease of use across the application
export const ragSearch = new RagSearchUtility();
