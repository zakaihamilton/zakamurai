import { formatCode } from '@/utils/formatter';
import { setInDraft, updateInDraft } from '../../Core/Base/StateUtils';
import { applyFileUpdate, computeDiff } from './utils/Applier';
import { parseAIResponse } from './utils/Parser';
import { resolveFilePath } from './utils/PathResolver';

/**
 * @typedef {Object} Diff
 * @property {number} start
 * @property {number} end
 * @property {string} type
 * @property {string} original
 */

/**
 * @typedef {Object} ProcessingResult
 * @property {string} content
 * @property {Diff[]} diffs
 */

/**
 * @typedef {Object} AIFileBlock
 * @property {string} filePath
 * @property {string} content
 */

/**
 * Main utility to process AI responses and apply changes to the state.
 *
 * @param {string} webLLMResult
 * @param {Object} fs
 * @param {Function} logState
 * @param {Function} sidebarState
 * @param {Function} editorState
 * @param {Object} tabState
 * @returns {Promise<number>} Number of files updated.
 */
export const processAIResponse = async (
  webLLMResult,
  fs,
  logState,
  sidebarState,
  editorState,
  tabState,
) => {
  if (!webLLMResult) return 0;

  const fileBlocks = parseAIResponse(webLLMResult, tabState?.activeTabId);
  const selectedLines =
    editorState && typeof editorState.useState === 'function'
      ? {}
      : editorState?.selectedLines || {};

  let filesUpdated = 0;
  const existingPaths =
    editorState && typeof editorState.useState !== 'function'
      ? Object.keys(editorState.fileContents || {})
      : [];

  for (const block of fileBlocks) {
    const filePath = resolveFilePath(block.filePath, existingPaths);

    try {
      let originalContent = '';
      if (fs?.rootHandle) {
        const handle = await fs.getFileHandleAtPath(filePath);
        if (handle) {
          originalContent = await fs.readFile(handle);
        }
      } else if (editorState && typeof editorState.useState !== 'function') {
        originalContent = editorState.fileContents?.[filePath] || '';
      }

      // Hallucination Protection is now largely handled inside applyFileUpdate
      // to allow for fuzzy-matched snippets.

      const fileSelectedLines = selectedLines[filePath] || [];
      const { content: appliedContent, diffs } = applyFileUpdate(
        originalContent,
        block.content,
        fileSelectedLines,
      );

      const finalContent = formatCode(appliedContent, filePath);
      const finalDiffData = computeDiff(originalContent, finalContent, fileSelectedLines);
      const finalDiffs = finalDiffData.diffs;

      if (finalContent === originalContent || !finalDiffs || finalDiffs.length === 0) {
        logState((draft) => {
          updateInDraft(draft, ['logs'], (logs = []) => [
            ...logs,
            {
              id: Date.now() + 3,
              role: 'system',
              text: `No changes applied to ${filePath}. The AI response did not match the current file.`,
              timestamp: new Date().toTimeString().split(' ')[0],
            },
          ]);
        });
        continue;
      }

      // Update Sidebar
      if (sidebarState) {
        sidebarState((draft) => {
          const parts = filePath.split('/').filter(Boolean);
          const fileName = parts[parts.length - 1];
          if (!draft.folderTree) draft.folderTree = [];
          let currentLevel = draft.folderTree;
          for (const seg of parts.slice(0, -1)) {
            let node = currentLevel.find((n) => n.name === seg && n.type === 'folder');
            if (!node) {
              node = { name: seg, type: 'folder', children: [] };
              currentLevel.push(node);
            }
            currentLevel = node.children;
          }
          if (!currentLevel.find((n) => n.name === fileName && n.type === 'file')) {
            currentLevel.push({ name: fileName, type: 'file' });
          }
        });
      }

      // Update Editor
      if (editorState) {
        editorState((draft) => {
          setInDraft(draft, ['fileContents', filePath], finalContent);

          if (diffs && diffs.length > 0) {
            const existingDiffs = draft.pendingDiffs || {};
            const existingOriginal = existingDiffs[filePath]?.originalContent;
            const existingCursor = existingDiffs[filePath]?.originalCursorPos;
            const currentCursor = editorState.cursorPos?.[filePath];

            setInDraft(draft, ['pendingDiffs', filePath], {
              originalContent: existingOriginal !== undefined ? existingOriginal : originalContent,
              originalCursorPos: existingCursor !== undefined ? existingCursor : currentCursor,
              diffs: finalDiffs,
            });
          }
        });
        filesUpdated++;
      }
    } catch (fsErr) {
      logState((draft) => {
        updateInDraft(draft, ['logs'], (logs = []) => [
          ...logs,
          {
            id: Date.now() + 4,
            role: 'system',
            text: `Failed to process ${filePath}: ${fsErr.message}`,
            timestamp: new Date().toTimeString().split(' ')[0],
          },
        ]);
      });
    }
  }

  if (filesUpdated > 0) {
    logState((draft) => {
      updateInDraft(draft, ['logs'], (logs = []) => [
        ...logs,
        {
          id: Date.now() + 5,
          role: 'system',
          text: `Successfully updated ${filesUpdated} file(s) ${fs?.rootHandle ? '' : '(Preview Mode)'}. Please review changes in the editor.`,
          timestamp: new Date().toTimeString().split(' ')[0],
        },
      ]);
    });
  }

  return filesUpdated;
};
