/**
 * Utility to process AI responses, extract file changes, and apply them to the file system.
 */
export const processAIResponse = async (webLLMResult, fs, logState, sidebarState, editorState) => {
  if (!webLLMResult) return 0;

  const fileRegex =
    /\/\/ --- File: (.*?) ---\s*([\s\S]*?)(?=\s*\/\/ --- (?:End )?File ---|\s*```|$)/g;
  let match = fileRegex.exec(webLLMResult);
  let filesUpdated = 0;

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

      if (blockContent.includes('<<<<<<< SEARCH')) {
        const result = applySearchReplace(originalContent, blockContent);
        finalContent = result.content;
        diffs = result.diffs;
      } else {
        diffs = computeDiff(originalContent, finalContent);
      }

      if (fs?.rootHandle) {
        await fs.writeFileAtPath(filePath, finalContent);
        filesUpdated++;
      } else if (sidebarState && editorState) {
        // Mock logic
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
          draft.fileContents = {
            ...(draft.fileContents || {}),
            [filePath]: finalContent,
          };

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
        });
        filesUpdated++;
      }
    } catch (fsErr) {
      logState((draft) => {
        draft.logs = [
          ...draft.logs,
          { id: Date.now() + 4, role: 'system', text: `Failed to save ${filePath}: ${fsErr.message}` },
        ];
      });
    }
    match = fileRegex.exec(webLLMResult);
  }

  if (filesUpdated > 0) {
    logState((draft) => {
      draft.logs = [
        ...draft.logs,
        { id: Date.now() + 5, role: 'system', text: `Successfully updated ${filesUpdated} file(s) ${fs?.rootHandle ? '' : '(Preview Mode)'}. Please review changes in the editor.` },
      ];
    });
  }

  return filesUpdated;
};

/**
 * Applies search/replace blocks and returns the new content and the ranges that changed.
 */
function applySearchReplace(original, blocks) {
  const blockRegex = /<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> REPLACE/g;
  let result = original;
  const diffs = [];
  let match = blockRegex.exec(blocks);
  while (match !== null) {
    const search = match[1];
    const replace = match[2];

    if (search || replace) {
      if (search === '') {
        const start = result.length;
        result += replace;
        diffs.push({ start, end: result.length, type: 'replacement' });
      } else {
        const foundIndex = result.indexOf(search);
        if (foundIndex !== -1) {
          result =
            result.substring(0, foundIndex) + replace + result.substring(foundIndex + search.length);
          diffs.push({ start: foundIndex, end: foundIndex + replace.length, type: 'replacement' });
        } else {
          // Fallback: trimmed matching
          const trimmedSearch = search.trim();
          const lines = result.split('\n');
          let fallbackIndex = -1;
          let subToReplace = '';

          if (trimmedSearch) {
            const searchLines = search.split('\n').length;
            for (let i = 0; i <= lines.length - searchLines; i++) {
              const sub = lines.slice(i, i + searchLines).join('\n');
              if (sub.trim() === trimmedSearch) {
                subToReplace = sub;
                fallbackIndex = result.indexOf(sub);
                break;
              }
            }
          }

          if (fallbackIndex !== -1) {
            result =
              result.substring(0, fallbackIndex) +
              replace +
              result.substring(fallbackIndex + subToReplace.length);
            diffs.push({ start: fallbackIndex, end: fallbackIndex + replace.length, type: 'replacement' });
          } else {
            console.warn('Search block not found in file:', search);
          }
        }
      }
    }
    match = blockRegex.exec(blocks);
  }
  return { content: result, diffs };
}

/**
 * Computes a single range diff for full-content replacements by finding common prefix/suffix.
 */
function computeDiff(original, updated) {
  if (original === updated) return [];

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

  return [{ start, end: endUpd, type: 'replacement' }];
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
  const filenameMatches = existingPaths.filter(
    (p) => p.endsWith(`/${fileName}`) || p === fileName,
  );
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
