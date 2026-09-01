import { computeDiff } from '@/components/AI/Processor/utils/DiffEngine';
import { resolveFilePath } from '@/components/AI/Processor/utils/PathResolver';
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
import { isProjectRelativePath } from '@/contracts/ai';
import { setInDraft, updateInDraft } from '@/utils/StateUtils';
import { formatCode } from '@/utils/formatter';
import { validateAIChanges } from '../ChangeValidator';

export function ensureFileInTree(
  sidebarState: StateHandle<SidebarStateDraft> | null | undefined,
  filePath: string,
): void {
  if (!sidebarState) return;
  sidebarState((draft) => {
    const parts = filePath.split('/').filter(Boolean);
    if (parts.length === 0) return;

    const folderTree = draft.folderTree ? [...draft.folderTree] : [];

    const nextExpanded = { ...(draft.expandedFolders || {}) };
    let pathAcc = '';
    for (const seg of parts.slice(0, -1)) {
      pathAcc = pathAcc ? `${pathAcc}/${seg}` : seg;
      nextExpanded[pathAcc] = true;
    }

    const ensureInLevel = (level: FolderTreeNode[], pathSegments: string[]): FolderTreeNode[] => {
      const nextLevel = [...level];
      if (pathSegments.length === 1) {
        const seg = pathSegments[0];
        if (!nextLevel.some((n) => n.name === seg && n.type === 'file')) {
          nextLevel.push({ name: seg, type: 'file' });
        }
        return nextLevel;
      }
      const seg = pathSegments[0];
      let folderIdx = nextLevel.findIndex((n) => n.name === seg && n.type === 'folder');
      let folderNode: FolderTreeNode;
      if (folderIdx === -1) {
        folderNode = { name: seg, type: 'folder', children: [] };
        nextLevel.push(folderNode);
        folderIdx = nextLevel.length - 1;
      } else {
        folderNode = { ...nextLevel[folderIdx] };
        nextLevel[folderIdx] = folderNode;
      }
      folderNode.children = ensureInLevel(folderNode.children || [], pathSegments.slice(1));
      return nextLevel;
    };

    draft.folderTree = ensureInLevel(folderTree, parts);
    draft.expandedFolders = nextExpanded;
  });
}

export function removeFileFromTree(
  sidebarState: StateHandle<SidebarStateDraft> | null | undefined,
  filePath: string,
): void {
  if (!sidebarState) return;
  sidebarState((draft) => {
    const parts = filePath.split('/').filter(Boolean);
    if (!draft.folderTree || parts.length === 0) return;

    const removeFromLevel = (level: FolderTreeNode[], pathSegments: string[]): FolderTreeNode[] => {
      if (pathSegments.length === 1) {
        const fileName = pathSegments[0];
        return level.filter((n) => !(n.name === fileName && n.type === 'file'));
      }
      const seg = pathSegments[0];
      return level.map((node) => {
        if (node.name === seg && node.type === 'folder' && node.children) {
          return {
            ...node,
            children: removeFromLevel(node.children, pathSegments.slice(1)),
          };
        }
        return node;
      });
    };

    draft.folderTree = removeFromLevel(draft.folderTree, parts);
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
    return { applied: 0, deletions: [], rejected: [] };
  }

  const existingPaths = Object.keys(
    (editorState as unknown as { fileContents?: Record<string, string> }).fileContents || {},
  );

  const resolvedChanges = changes.map((change) => {
    const rawPath = change.path ?? change.filePath ?? '';
    if (typeof rawPath !== 'string' || !isProjectRelativePath(rawPath)) {
      return { ...change, path: rawPath };
    }
    const resolvedPath = resolveFilePath(rawPath, existingPaths);
    return { ...change, path: resolvedPath };
  });

  const validation = validateAIChanges(resolvedChanges);
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
  if (autoApprove && validation.rejected.length > 0) {
    return { applied: 0, deletions: [], changeSet: null, rejected: validation.rejected };
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
      const existingDiffs = draft.pendingDiffs || {};
      if (autoApprove) {
        if (existingDiffs[path]) {
          const nextDiffs = { ...existingDiffs };
          delete nextDiffs[path];
          draft.pendingDiffs = nextDiffs;
        }
        return;
      }
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

  return { applied, deletions, changeSet, rejected: validation.rejected };
}
