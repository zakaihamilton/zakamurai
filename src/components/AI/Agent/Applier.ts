import { computeDiff } from '@/components/AI/Processor/utils/DiffEngine';
import type {
  AgentChange,
  ApplyAgentChangesResult,
  ApplyAgentChangesStates,
  FolderTreeNode,
  LogEntry,
  SidebarStateDraft,
  StateHandle,
} from '@/components/AI/types';
import { addChangeSet, createChangeSet } from '@/components/Workspace/ChangeSets';
import { setInDraft, updateInDraft } from '@/components/state/StateUtils';
import { formatCode } from '@/utils/formatter';
import { validateAIChanges } from '../ChangeValidator';

function ensureFileInTree(
  sidebarState: StateHandle<SidebarStateDraft> | null | undefined,
  filePath: string,
): void {
  if (!sidebarState) return;
  sidebarState((draft) => {
    const parts = filePath.split('/').filter(Boolean);
    const fileName = parts[parts.length - 1];
    if (!draft.folderTree) draft.folderTree = [];
    let currentLevel = draft.folderTree;
    for (const seg of parts.slice(0, -1)) {
      let node = currentLevel.find((n: FolderTreeNode) => n.name === seg && n.type === 'folder');
      if (!node) {
        node = { name: seg, type: 'folder', children: [] };
        currentLevel.push(node);
      }
      currentLevel = node.children || [];
    }
    if (!currentLevel.find((n: FolderTreeNode) => n.name === fileName && n.type === 'file')) {
      currentLevel.push({ name: fileName, type: 'file' });
    }
  });
}

export function applyAgentChanges(
  changes: AgentChange[],
  {
    editorState,
    sidebarState,
    logState,
    changeSetState,
    request,
    validation: validationResult,
    autoApprove = false,
  }: ApplyAgentChangesStates,
): ApplyAgentChangesResult {
  if (!Array.isArray(changes) || !editorState) {
    return { applied: 0, deletions: [] };
  }

  const validation = validateAIChanges(changes);
  const validChanges = validation.accepted;
  if (validation.rejected.length > 0 && logState) {
    logState((draft) => {
      updateInDraft(draft, ['logs'], (logs: LogEntry[] | undefined) => [
        ...(logs ?? []),
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
      after: formatCode(change.after as string, change.path),
    }))
    .filter((change) => change.before !== change.after);
  const deletions = validChanges
    .filter((change) => change.after === undefined && typeof change.before === 'string')
    .map(({ path, before }) => ({ path, before: before as string }));

  const stagedChanges = [
    ...writes,
    ...deletions.map(({ path, before }) => ({ path, before, after: undefined })),
  ];
  const changeSet =
    !autoApprove && stagedChanges.length
      ? createChangeSet({ request, changes: stagedChanges, validation: validationResult })
      : null;
  if (!autoApprove) addChangeSet(changeSetState ?? null, changeSet);
  let applied = 0;

  for (const { path, before, after } of writes) {
    const originalContent = before;
    const finalContent = after;
    const { diffs } = computeDiff(originalContent, finalContent);

    if (finalContent === originalContent || !diffs || diffs.length === 0) {
      if (logState) {
        logState((draft) => {
          updateInDraft(draft, ['logs'], (logs: LogEntry[] | undefined) => [
            ...(logs ?? []),
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
      if (autoApprove) return;
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
      updateInDraft(draft, ['logs'], (logs: LogEntry[] | undefined) => [
        ...(logs ?? []),
        {
          id: Date.now() + 5,
          role: 'system',
          text: autoApprove
            ? `Applied ${applied} initial project file(s).`
            : `Successfully updated ${applied} file(s). Please review changes in the editor.`,
          timestamp: new Date().toTimeString().split(' ')[0],
        },
      ]);
    });
  }

  return { applied, deletions, changeSet };
}
