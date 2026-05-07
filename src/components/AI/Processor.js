/**
 * Utility to process AI responses, extract file changes, and apply them to the file system.
 */
export const processAIResponse = async (
  webLLMResult,
  fs,
  logState,
  sidebarState,
  editorState,
  tabState,
) => {
  const selectedLines = editorState?.selectedLines || {};
  if (!webLLMResult) return 0;

  const fileRegex =
    /\/\/ --- File: (.*?) ---\s*([\s\S]*?)(?=\s*\/\/ --- (?:End )?File ---|\s*```|$)/g;
  let match = fileRegex.exec(webLLMResult);
  let filesUpdated = 0;

  // Fallback: If no markers found but we have an active tab and the result looks like code
  if (match === null && tabState && tabState.activeTabId) {
    const activeTabId = tabState.activeTabId;
    // Look for code blocks or just use the whole result if it looks like code
    const codeBlockRegex = /```[a-z]*\n([\s\S]*?)```/g;
    const blockMatch = codeBlockRegex.exec(webLLMResult);
    const contentToProcess = blockMatch ? blockMatch[1] : webLLMResult;

    if (contentToProcess && contentToProcess.trim().length > 10) {
      // Mock a match for the active file
      match = [null, activeTabId, contentToProcess];
    }
  }

  while (match !== null) {
    const rawFilePath = match[1].trim();
    const blockContent = match[2].trim();

    // Resolve path to handle AI-added prefixes (e.g., path/to/src/...)
    const existingPaths = editorState ? Object.keys(editorState.fileContents || {}) : [];
    const filePath = resolveFilePath(rawFilePath, existingPaths);

    try {
      let finalContent = blockContent;
      let diffs = [];

      // Record current content for diff tracking before we update
      let originalContent = '';
      if (fs?.rootHandle) {
        const handle = await fs.getFileHandleAtPath(filePath);
        if (handle) {
          originalContent = await fs.readFile(handle);
        }
      } else if (editorState) {
        originalContent = editorState.fileContents?.[filePath] || '';
      }

      const fileSelectedLines = selectedLines[filePath] || [];

      if (blockContent.includes('<<<<<<< SEARCH')) {
        const result = applySearchReplace(originalContent, blockContent, fileSelectedLines);
        finalContent = result.content;
        diffs = result.diffs;
      } else if (fileSelectedLines.length > 0) {
        // If it looks like a snippet and not the full file, replace just the targeted lines
        const isLikelyFullFile = blockContent.length >= originalContent.length * 0.8;
        if (!isLikelyFullFile) {
          const result = applyTargetedReplacement(originalContent, blockContent, fileSelectedLines);
          finalContent = result.content;
          diffs = result.diffs;
        } else {
          const result = computeDiff(originalContent, blockContent, fileSelectedLines);
          finalContent = result.content;
          diffs = result.diffs;
        }
      } else {
        const result = computeDiff(originalContent, blockContent, fileSelectedLines);
        finalContent = result.content;
        diffs = result.diffs;
      }

      // Ensure the sidebar reflects new files even if we don't save to FS immediately yet
      if (sidebarState && editorState) {
        const parts = filePath.split('/').filter(Boolean);
        const fileName = parts[parts.length - 1];

        sidebarState((draft) => {
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

      if (editorState) {
        editorState((draft) => {
          if (!draft.fileContents) draft.fileContents = {};
          draft.fileContents[filePath] = finalContent;
          // Force a new reference to trigger observers
          draft.fileContents = { ...draft.fileContents };

          if (diffs && diffs.length > 0) {
            const existingDiffs = draft.pendingDiffs || {};
            const existingOriginal = existingDiffs[filePath]?.originalContent;

            draft.pendingDiffs = {
              ...existingDiffs,
              [filePath]: {
                originalContent:
                  existingOriginal !== undefined ? existingOriginal : originalContent,
                diffs: diffs,
              },
            };
          }
        });
        filesUpdated++;
      }
    } catch (fsErr) {
      logState((draft) => {
        draft.logs = [
          ...draft.logs,
          {
            id: Date.now() + 4,
            role: 'system',
            text: `Failed to save ${filePath}: ${fsErr.message}`,
          },
        ];
      });
    }
    match = fileRegex.exec(webLLMResult);
  }

  if (filesUpdated > 0) {
    logState((draft) => {
      draft.logs = [
        ...draft.logs,
        {
          id: Date.now() + 5,
          role: 'system',
          text: `Successfully updated ${filesUpdated} file(s) ${fs?.rootHandle ? '' : '(Preview Mode)'}. Please review changes in the editor.`,
        },
      ];
    });
  }

  return filesUpdated;
};

/**
 * Applies search/replace blocks and returns the new content and the ranges that changed.
 * Only applies changes if they overlap with selectedLines (if provided).
 */
function applySearchReplace(original, blocks, selectedLines = []) {
  const blockRegex =
    /<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> REPLACE/g;
  let result = original;
  const diffs = [];
  let match = blockRegex.exec(blocks);

  // Convert selected line numbers to character ranges for easier overlap checking
  const lines = original.split('\n');
  const selectedRanges = selectedLines.map((l) => {
    let start = 0;
    for (let i = 0; i < l - 1; i++) start += lines[i].length + 1;
    return { start, end: start + lines[l - 1].length };
  });

  while (match !== null) {
    const search = match[1];
    const replace = match[2];

    if (search || replace) {
      const foundIndex = original.indexOf(search);
      const searchEnd = foundIndex + (search ? search.length : 0);

      const isAllowed =
        selectedLines.length === 0 ||
        selectedRanges.some((r) => {
          return (
            (foundIndex >= r.start && foundIndex <= r.end) ||
            (searchEnd >= r.start && searchEnd <= r.end) ||
            (r.start >= foundIndex && r.start <= searchEnd)
          );
        });

      if (isAllowed) {
        if (search === '') {
          const start = result.length;
          result += replace;
          diffs.push({
            start,
            end: result.length,
            type: 'replacement',
            original: '',
          });
        } else if (foundIndex !== -1) {
          const currentIdx = result.indexOf(search);
          if (currentIdx !== -1) {
            result =
              result.substring(0, currentIdx) +
              replace +
              result.substring(currentIdx + search.length);
            diffs.push({
              start: currentIdx,
              end: currentIdx + replace.length,
              type: 'replacement',
              original: search,
            });
          }
        }
      }
    }
    match = blockRegex.exec(blocks);
  }
  return { content: result, diffs };
}

/**
 * Computes a single range diff and filters it by selectedLines if provided.
 */
function computeDiff(original, updated, selectedLines = []) {
  if (original === updated) return { content: original, diffs: [] };

  let start = 0;
  while (start < original.length && start < updated.length && original[start] === updated[start]) {
    start++;
  }

  let endOrig = original.length;
  let endUpd = updated.length;
  while (endOrig > start && endUpd > start && original[endOrig - 1] === updated[endUpd - 1]) {
    endOrig--;
    endUpd--;
  }

  const _diffRange = { start, end: endUpd };

  if (selectedLines.length > 0) {
    const lines = original.split('\n');
    const selectedRanges = selectedLines.map((l) => {
      let s = 0;
      for (let i = 0; i < l - 1; i++) s += lines[i].length + 1;
      return { start: s, end: s + lines[l - 1].length };
    });

    const isOverlap = selectedRanges.some((r) => {
      return (
        (start >= r.start && start <= r.end) ||
        (endUpd >= r.start && endUpd <= r.end) ||
        (r.start >= start && r.start <= endUpd)
      );
    });

    if (!isOverlap) {
      return { content: original, diffs: [] };
    }
  }

  return {
    content: updated,
    diffs: [
      {
        start,
        end: endUpd,
        type: 'replacement',
        original: original.substring(start, endOrig),
      },
    ],
  };
}

/**
 * Replaces specifically the selected lines with the updated snippet.
 */
function applyTargetedReplacement(original, snippet, selectedLines = []) {
  if (selectedLines.length === 0) return { content: original, diffs: [] };
  
  const originalLines = original.split('\n');
  const sortedLines = [...selectedLines].sort((a, b) => a - b);
  const minLine = sortedLines[0];
  const maxLine = sortedLines[sortedLines.length - 1];

  const startIdx = Math.max(0, minLine - 1);
  const endIdx = Math.min(originalLines.length - 1, maxLine - 1);

  const before = originalLines.slice(0, startIdx).join('\n');
  const after = originalLines.slice(endIdx + 1).join('\n');
  
  const beforeStr = before ? `${before}\n` : '';
  const afterStr = after ? `\n${after}` : '';

  const newContent = `${beforeStr}${snippet}${afterStr}`;

  const start = beforeStr.length;
  const end = start + snippet.length;

  const originalReplaced = originalLines.slice(startIdx, endIdx + 1).join('\n');

  return {
    content: newContent,
    diffs: [
      {
        start,
        end,
        type: 'replacement',
        original: originalReplaced,
      },
    ],
  };
}

/**
 * Tries to find the best existing file path that matches the provided path.
 */
function resolveFilePath(providedPath, existingPaths) {
  if (!existingPaths || existingPaths.length === 0) return providedPath;
  if (existingPaths.includes(providedPath)) return providedPath;

  // Normalize providedPath
  const normalized = providedPath.replace(/^\.\//, '').replace(/\/+/g, '/');
  if (existingPaths.includes(normalized)) return normalized;

  const providedSegments = normalized.split('/').filter(Boolean);
  const fileName = providedSegments[providedSegments.length - 1];

  // 1. Try exact filename match if unique
  const filenameMatches = existingPaths.filter((p) => p.endsWith(`/${fileName}`) || p === fileName);
  if (filenameMatches.length === 1) return filenameMatches[0];

  // 2. Try longest suffix match
  let bestMatch = providedPath;
  let maxSuffixLength = 0;
  for (const existing of existingPaths) {
    const existingSegments = existing.split('/').filter(Boolean);
    let commonSuffixLength = 0;
    const minLen = Math.min(providedSegments.length, existingSegments.length);
    for (let i = 1; i <= minLen; i++) {
      if (
        providedSegments[providedSegments.length - i] ===
        existingSegments[existingSegments.length - i]
      ) {
        commonSuffixLength++;
      } else {
        break;
      }
    }
    if (commonSuffixLength > maxSuffixLength) {
      maxSuffixLength = commonSuffixLength;
      bestMatch = existing;
    }
  }

  // If we found a match that covers at least the filename, use it
  if (maxSuffixLength >= 1) return bestMatch;

  return providedPath;
}
