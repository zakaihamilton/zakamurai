import type {
  EditorStateDraft,
  FileMap,
  FileSystemLike,
  LogEntry,
  LogStateDraft,
  ProcessAIOptions,
  SidebarStateDraft,
  StateHandle,
  TabState,
} from '@/components/AI/types';
import { formatCode } from '@/utils/formatter';
import { setInDraft, updateInDraft } from '../../state/StateUtils';
import { ensureFileInTree } from '../Agent/Applier';
import { validateAIChangesAsync } from '../ChangeValidator';
import { applyFileUpdate, computeDiff } from './utils/Applier';
import { parseAIResponse } from './utils/Parser';
import { resolveFilePath } from './utils/PathResolver';

export const processAIResponse = async (
  webLLMResult: string,
  fs: FileSystemLike | null,
  logState: StateHandle<LogStateDraft> | null,
  sidebarState: StateHandle<SidebarStateDraft> | null,
  editorState: StateHandle<EditorStateDraft> | null,
  tabState: TabState | null,
  originalContents: FileMap = {},
  options: ProcessAIOptions = {},
): Promise<number> => {
  if (!webLLMResult) return 0;

  const { esbuildTransform = null, repairRunner = null, maxRepairRetries = 2 } = options;

  let currentResult = webLLMResult;
  let attempt = 0;
  let parsedBlocks = parseAIResponse(currentResult, tabState?.activeTabId);
  let validation = await validateAIChangesAsync(
    parsedBlocks.map((block) => ({ ...block, path: block.filePath, content: block.content })),
    esbuildTransform,
  );

  while (
    validation.rejected.length > 0 &&
    typeof repairRunner === 'function' &&
    attempt < maxRepairRetries
  ) {
    attempt++;
    const firstRejection = validation.rejected[0];
    if (logState) {
      logState((draft) => {
        updateInDraft(draft, ['logs'], (logs: LogEntry[] | undefined) => [
          ...(logs ?? []),
          {
            id: `${Date.now()}-repair-${attempt}`,
            role: 'system',
            text: `[Auto-Repair Attempt ${attempt}/${maxRepairRetries}] Repairing error: ${firstRejection}`,
            timestamp: new Date().toTimeString().split(' ')[0],
          },
        ]);
      });
    }

    const repairPrompt = `Diagnostic Error Trace: ${firstRejection}\nOriginal Patch:\n${currentResult}`;
    const repairedResult = await repairRunner(repairPrompt);
    if (!repairedResult) break;

    currentResult = repairedResult;
    parsedBlocks = parseAIResponse(currentResult, tabState?.activeTabId);
    validation = await validateAIChangesAsync(
      parsedBlocks.map((block) => ({ ...block, path: block.filePath, content: block.content })),
      esbuildTransform,
    );
  }

  const fileBlocks = validation.accepted.map(({ path, ...block }) => block);
  if (validation.rejected.length > 0 && logState) {
    logState((draft) => {
      updateInDraft(draft, ['logs'], (logs: LogEntry[] | undefined) => [
        ...(logs ?? []),
        ...validation.rejected.map((text, index) => ({
          id: `${Date.now()}-validation-${index}`,
          role: 'system',
          text: `Rejected AI change: ${text}`,
          timestamp: new Date().toTimeString().split(' ')[0],
        })),
      ]);
    });
  }
  const selectedLines =
    editorState && typeof (editorState as { useState?: unknown }).useState === 'function'
      ? {}
      : editorState?.selectedLines || {};

  let filesUpdated = 0;
  const existingPaths = Array.from(
    new Set([
      ...Object.keys(originalContents || {}),
      ...Object.keys(editorState?.fileContents || {}),
    ]),
  );

  for (const block of fileBlocks) {
    const filePath = resolveFilePath(block.filePath ?? '', existingPaths);

    try {
      const suppliedOriginal = originalContents[filePath];
      let originalContent = typeof suppliedOriginal === 'string' ? suppliedOriginal : '';
      if (
        typeof suppliedOriginal !== 'string' &&
        fs?.rootHandle &&
        fs.getFileHandleAtPath &&
        fs.readFile
      ) {
        const handle = await fs.getFileHandleAtPath(filePath);
        if (handle) {
          originalContent = await fs.readFile(handle);
        }
      } else if (
        typeof suppliedOriginal !== 'string' &&
        editorState &&
        typeof (editorState as { useState?: unknown }).useState !== 'function'
      ) {
        originalContent = editorState.fileContents?.[filePath] || '';
      }

      const fileSelectedLines = selectedLines[filePath] || [];
      const { content: appliedContent } = applyFileUpdate(
        originalContent,
        block.content ?? '',
        fileSelectedLines,
      );

      const finalContent = formatCode(appliedContent, filePath);
      const finalDiffData = computeDiff(originalContent, finalContent, fileSelectedLines);
      const finalDiffs = finalDiffData.diffs;

      if (finalContent === originalContent || !finalDiffs || finalDiffs.length === 0) {
        logState?.((draft) => {
          updateInDraft(draft, ['logs'], (logs: LogEntry[] | undefined) => [
            ...(logs ?? []),
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

      if (sidebarState) {
        ensureFileInTree(sidebarState, filePath);
      }

      if (editorState) {
        editorState((draft) => {
          setInDraft(draft, ['fileContents', filePath], finalContent);

          if (finalDiffs.length > 0) {
            const existingDiffs = draft.pendingDiffs || {};
            const existingOriginal = existingDiffs[filePath]?.originalContent;
            const existingCursor = existingDiffs[filePath]?.originalCursorPos;
            const currentCursor = editorState.cursorPos?.[filePath];
            const reviewOriginal =
              typeof suppliedOriginal === 'string'
                ? suppliedOriginal
                : existingOriginal !== undefined
                  ? existingOriginal
                  : originalContent;
            const reviewDiffs = computeDiff(reviewOriginal, finalContent).diffs;

            setInDraft(draft, ['pendingDiffs', filePath], {
              originalContent: reviewOriginal,
              modifiedContent: finalContent,
              originalCursorPos: existingCursor !== undefined ? existingCursor : currentCursor,
              diffs: reviewDiffs,
            });
          }
        });
        filesUpdated++;
      }
    } catch (fsErr) {
      const error = fsErr as Error;
      logState?.((draft) => {
        updateInDraft(draft, ['logs'], (logs: LogEntry[] | undefined) => [
          ...(logs ?? []),
          {
            id: Date.now() + 4,
            role: 'system',
            text: `Failed to process ${filePath}: ${error.message}`,
            timestamp: new Date().toTimeString().split(' ')[0],
          },
        ]);
      });
    }
  }

  if (filesUpdated > 0) {
    logState?.((draft) => {
      updateInDraft(draft, ['logs'], (logs: LogEntry[] | undefined) => [
        ...(logs ?? []),
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
