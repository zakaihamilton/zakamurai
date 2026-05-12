import { beforeEach, describe, expect, test, vi } from 'vitest';
import { processAIResponse } from './Main';

describe('Main', () => {
  describe('processAIResponse', () => {
    let mockFS;
    let mockLogState;
    let mockSidebarState;
    let mockEditorState;
    let mockTabState;

    beforeEach(() => {
      mockFS = {
        rootHandle: {},
        getFileHandleAtPath: vi.fn().mockResolvedValue({}),
        readFile: vi.fn().mockResolvedValue('original content'),
      };
      mockLogState = vi.fn((fn) => {
        const draft = { logs: [] };
        fn(draft);
        return draft;
      });
      mockSidebarState = vi.fn();
      mockEditorState = vi.fn((fn) => {
        const draft = { fileContents: { 'test.js': 'original content' }, pendingDiffs: {} };
        fn(draft);
        return draft;
      });
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
original content
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
  });
});
