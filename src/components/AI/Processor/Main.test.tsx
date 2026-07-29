import type {
  EditorStateDraft,
  FileSystemLike,
  LogStateDraft,
  SidebarStateDraft,
  StateHandle,
  TabState,
} from '@/components/AI/types';
import {
  createEditorStateMock,
  createLogStateMock,
  createSidebarStateMock,
} from '@/test-utils/agentMocks';
import { type Mock, beforeEach, describe, expect, test, vi } from 'vitest';
import { processAIResponse } from './Main';

describe('Main', () => {
  describe('processAIResponse', () => {
    let mockFS: FileSystemLike;
    let mockLogState: StateHandle<LogStateDraft> & Mock;
    let mockSidebarState: StateHandle<SidebarStateDraft> & Mock;
    let mockEditorState: StateHandle<EditorStateDraft> & Mock;
    let mockTabState: TabState;

    beforeEach(() => {
      mockFS = {
        rootHandle: {} as FileSystemDirectoryHandle,
        getFileHandleAtPath: vi.fn().mockResolvedValue({}),
        readFile: vi.fn().mockResolvedValue('old content'),
      };
      mockLogState = createLogStateMock({ logs: [] }) as StateHandle<LogStateDraft> & Mock;
      mockSidebarState = createSidebarStateMock({
        folderTree: [],
      }) as StateHandle<SidebarStateDraft> & Mock;
      mockEditorState = createEditorStateMock({
        fileContents: { 'test.js': 'old content' },
        pendingDiffs: {},
      }) as StateHandle<EditorStateDraft> & Mock;
      mockTabState = { activeTabId: 'test.js' };
    });

    test('processes full file rewrite', async () => {
      const aiResponse = `// --- File: test.js ---
new content
// --- End File ---`;

      const result = await processAIResponse(
        aiResponse,
        mockFS,
        mockLogState,
        mockSidebarState,
        mockEditorState,
        mockTabState,
      );

      expect(result).toBe(1);
      expect(mockEditorState).toHaveBeenCalled();
    });

    test('processes SEARCH/REPLACE block', async () => {
      const aiResponse = `// --- File: test.js ---
<<<<<<< SEARCH
old content
=======
modified content
>>>>>>> REPLACE
// --- End File ---`;

      const result = await processAIResponse(
        aiResponse,
        mockFS,
        mockLogState,
        mockSidebarState,
        mockEditorState,
        mockTabState,
      );

      expect(result).toBe(1);
      expect(mockEditorState).toHaveBeenCalled();
    });

    test('fallback to active tab if no markers', async () => {
      const aiResponse = 'Just some code without markers but with length > 10';
      const result = await processAIResponse(
        aiResponse,
        null,
        mockLogState,
        mockSidebarState,
        mockEditorState,
        { activeTabId: 'active.js' },
      );

      expect(result).toBe(1);
    });

    test('does not count unmatched SEARCH/REPLACE as an update', async () => {
      const aiResponse = `// --- File: test.js ---
<<<<<<< SEARCH
missing content
=======
modified content
>>>>>>> REPLACE
// --- End File ---`;

      const result = await processAIResponse(
        aiResponse,
        mockFS,
        mockLogState,
        mockSidebarState,
        mockEditorState,
        mockTabState,
      );

      expect(result).toBe(0);
    });

    test('recomputes accumulated diff ranges against the first review baseline', async () => {
      const state: EditorStateDraft = {
        fileContents: { 'test.js': 'one\ntwo\nthree' },
        pendingDiffs: {
          'test.js': {
            originalContent: 'one\nthree',
            modifiedContent: 'one\ntwo\nthree',
            diffs: [],
          },
        },
      };
      const editorState = createEditorStateMock(state) as StateHandle<EditorStateDraft> & Mock;
      const fs: FileSystemLike = {
        rootHandle: {} as FileSystemDirectoryHandle,
        getFileHandleAtPath: vi.fn().mockResolvedValue({}),
        readFile: vi.fn().mockResolvedValue('one\ntwo\nthree'),
      };
      const response = `// --- File: test.js ---
one
two
three
four
// --- End File ---`;

      expect(
        await processAIResponse(
          response,
          fs,
          mockLogState,
          mockSidebarState,
          editorState,
          mockTabState,
        ),
      ).toBe(1);

      const pending = state.pendingDiffs?.['test.js'];
      expect(pending?.originalContent).toBe('one\nthree');
      expect(pending?.modifiedContent).toBe('one\ntwo\nthree\nfour');
      expect(pending?.diffs.map(({ original, updated }) => ({ original, updated }))).toEqual([
        { original: '', updated: 'two' },
        { original: '', updated: 'four' },
      ]);
    });

    test('uses the agent before snapshot as the authoritative original', async () => {
      const state: EditorStateDraft = {
        fileContents: { 'test.js': 'mutable editor state' },
        pendingDiffs: {},
      };
      const editorState = createEditorStateMock(state) as StateHandle<EditorStateDraft> & Mock;
      const response = `// --- File: test.js ---
original
added
// --- End File ---`;

      await processAIResponse(
        response,
        mockFS,
        mockLogState,
        mockSidebarState,
        editorState,
        mockTabState,
        { 'test.js': 'original' },
      );

      expect(state.pendingDiffs?.['test.js']?.originalContent).toBe('original');
      expect(state.pendingDiffs?.['test.js']?.diffs).toEqual(
        expect.arrayContaining([expect.objectContaining({ original: '', updated: 'added' })]),
      );
      expect(mockFS.readFile).not.toHaveBeenCalled();
    });

    test('creates missing directory nodes in sidebar state', async () => {
      vi.mocked(mockFS.getFileHandleAtPath).mockResolvedValue(null);
      const sidebarStateObj: SidebarStateDraft = { folderTree: [] };
      const sidebarState = createSidebarStateMock(sidebarStateObj);

      const response = `// --- File: nested/dir/newfile.js ---
content
// --- End File ---`;

      await processAIResponse(
        response,
        mockFS,
        mockLogState,
        sidebarState,
        mockEditorState,
        mockTabState,
      );

      expect(sidebarStateObj.folderTree?.[0]?.name).toBe('nested');
      expect(sidebarStateObj.folderTree?.[0]?.type).toBe('folder');
      expect(sidebarStateObj.folderTree?.[0]?.children?.[0]?.name).toBe('dir');
      expect(sidebarStateObj.folderTree?.[0]?.children?.[0]?.children?.[0]?.name).toBe(
        'newfile.js',
      );
    });

    test('handles filesystem and processing errors gracefully by logging', async () => {
      vi.mocked(mockFS.readFile).mockRejectedValue(new Error('FS Read Error'));

      const response = `// --- File: test.js ---
new content
// --- End File ---`;

      const result = await processAIResponse(
        response,
        mockFS,
        mockLogState,
        mockSidebarState,
        mockEditorState,
        mockTabState,
      );

      expect(result).toBe(0);
      expect(mockLogState).toHaveBeenCalled();
    });

    test('handles editorState with useState function branch', async () => {
      const editorState = Object.assign(vi.fn(), {
        useState: vi.fn(),
      }) as StateHandle<EditorStateDraft> & Mock & { useState: Mock };

      const response = `// --- File: test.js ---
new content
// --- End File ---`;

      const result = await processAIResponse(
        response,
        mockFS,
        mockLogState,
        mockSidebarState,
        editorState,
        mockTabState,
      );

      expect(result).toBe(1);
    });

    test('invokes repairRunner auto-repair loop on syntax error', async () => {
      const invalidResponse = `// --- File: bad.js ---
function unclosed() {
// --- End File ---`;
      const validRepairedResponse = `// --- File: test.js ---
repaired content
// --- End File ---`;

      const mockRepairRunner = vi.fn().mockResolvedValue(validRepairedResponse);

      const result = await processAIResponse(
        invalidResponse,
        mockFS,
        mockLogState,
        mockSidebarState,
        mockEditorState,
        mockTabState,
        {},
        { repairRunner: mockRepairRunner, maxRepairRetries: 2 },
      );

      expect(mockRepairRunner).toHaveBeenCalledOnce();
      expect(result).toBe(1);
    });
  });
});
