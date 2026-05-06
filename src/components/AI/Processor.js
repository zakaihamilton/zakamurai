/**
 * Utility to process AI responses, extract file changes, and apply them to the file system.
 */
export const processAIResponse = async (webLLMResult, fs, logState, sidebarState, editorState) => {
  if (!webLLMResult) return 0;

  // Brute-force permissive regex to find file blocks
  const fileRegex =
    /\/\/ --- File: (.*?) ---\s*([\s\S]*?)(?=\s*\/\/ --- (?:End )?File ---|\s*```|$)/g;
  let match = fileRegex.exec(webLLMResult);
  let filesUpdated = 0;

  while (match !== null) {
    const filePath = match[1].trim();
    const content = match[2].trim();

    try {
      if (fs?.rootHandle) {
        // Real FS update
        await fs.writeFileAtPath(filePath, content);
        filesUpdated++;
      } else if (sidebarState && editorState) {
        // Mock FS update (fallback when no folder is mounted)
        const parts = filePath.split('/').filter(Boolean);
        const fileName = parts[parts.length - 1];

        sidebarState((draft) => {
          if (!draft.folderTree) draft.folderTree = [];
          let currentLevel = draft.folderTree;

          for (let i = 0; i < parts.length - 1; i++) {
            const seg = parts[i];
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

        editorState((draft) => {
          if (!draft.fileContents) draft.fileContents = {};
          draft.fileContents[filePath] = content;
        });

        filesUpdated++;
      } else {
        throw new Error('No root directory mounted and no state updaters available.');
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
          text: `Successfully updated ${filesUpdated} file(s) ${fs?.rootHandle ? '' : '(Preview Mode)'}.`,
        },
      ];
    });
  }

  return filesUpdated;
};
