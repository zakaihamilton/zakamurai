import { computeDiff } from '@/components/AI/Processor/utils/DiffEngine';
import { addChangeSet, createChangeSet } from '@/components/Workspace/ChangeSets';
import { setInDraft, updateInDraft } from '@/components/state/StateUtils';
import { formatCode } from '@/utils/formatter';
import { validateAIChanges } from '../ChangeValidator';

/**
 * Ensure a file path exists in the sidebar folder tree.
 * @param {Function} sidebarState
 * @param {string} filePath
 */
function ensureFileInTree(sidebarState, filePath) {
  if (!sidebarState) return;
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

/**
 * Apply agent write/create changes directly as pending diffs (no fuzzy re-parse).
 *
 * @param {Array<{ path: string, before?: string, after?: string }>} changes
 * @param {{ editorState: Function, sidebarState?: Function, logState?: Function }} states
 * @returns {{ applied: number, deletions: Array<{ path: string, before: string }> }}
 */
export function applyAgentChanges(
  changes,
  { editorState, sidebarState, logState, changeSetState, request, validation: validationResult },
) {
  if (!Array.isArray(changes) || !editorState) {
    return { applied: 0, deletions: [] };
  }

  const validation = validateAIChanges(changes);
  const validChanges = validation.accepted;
  if (validation.rejected.length > 0 && logState) {
    logState((draft) => {
      updateInDraft(draft, ['logs'], (logs = []) => [
        ...logs,
        ...validation.rejected.map((text, index) => ({
          id: `${Date.now()}-validation-${index}`,
          role: 'system',
          text: `Rejected agent change: ${text}`,
          timestamp: new Date().toTimeString().split(' ')[0],
        })),
      ]);
    });
  }
  const writes = validChanges
    .filter((change) => change.after !== undefined)
    .map((change) => ({
      ...change,
      before: typeof change.before === 'string' ? change.before : '',
      after: formatCode(change.after, change.path),
    }))
    .filter((change) => change.before !== change.after);
  const deletions = validChanges
    .filter((change) => change.after === undefined && typeof change.before === 'string')
    .map(({ path, before }) => ({ path, before }));

  const stagedChanges = [
    ...writes,
    ...deletions.map(({ path, before }) => ({ path, before, after: undefined })),
  ];
  const changeSet = stagedChanges.length
    ? createChangeSet({ request, changes: stagedChanges, validation: validationResult })
    : null;
  addChangeSet(changeSetState, changeSet);
  let applied = 0;

  for (const { path, before, after } of writes) {
    const originalContent = before;
    const finalContent = after;
    const { diffs } = computeDiff(originalContent, finalContent);

    if (finalContent === originalContent || !diffs || diffs.length === 0) {
      if (logState) {
        logState((draft) => {
          updateInDraft(draft, ['logs'], (logs = []) => [
            ...logs,
            {
              id: Date.now() + 3,
              role: 'system',
              text: `No changes applied to ${path}.`,
              timestamp: new Date().toTimeString().split(' ')[0],
            },
          ]);
        });
      }
      continue;
    }

    ensureFileInTree(sidebarState, path);

    editorState((draft) => {
      setInDraft(draft, ['fileContents', path], finalContent);
      const existingDiffs = draft.pendingDiffs || {};
      const existingCursor = existingDiffs[path]?.originalCursorPos;
      const currentCursor = editorState.cursorPos?.[path];
      setInDraft(draft, ['pendingDiffs', path], {
        originalContent,
        modifiedContent: finalContent,
        originalCursorPos: existingCursor !== undefined ? existingCursor : currentCursor,
        diffs,
        changeSetId: changeSet?.id,
      });
    });
    applied += 1;
  }

  if (applied > 0 && logState) {
    logState((draft) => {
      updateInDraft(draft, ['logs'], (logs = []) => [
        ...logs,
        {
          id: Date.now() + 5,
          role: 'system',
          text: `Successfully updated ${applied} file(s). Please review changes in the editor.`,
          timestamp: new Date().toTimeString().split(' ')[0],
        },
      ]);
    });
  }

  return { applied, deletions, changeSet };
}
