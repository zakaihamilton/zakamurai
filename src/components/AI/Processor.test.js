import { describe, it, expect, test, vi, beforeEach } from 'vitest';
import {
  resolveFilePath,
  applySearchReplace,
  computeDiff,
  applyTargetedReplacement,
  processAIResponse,
} from './Processor';

describe('AI Processor', () => {
  describe('resolveFilePath', () => {
    const existing = ['src/App.js', 'src/components/Button.js', 'index.html'];

    test('exact match', () => {
      expect(resolveFilePath('src/App.js', existing)).toBe('src/App.js');
    });

    test('normalized match', () => {
      expect(resolveFilePath('./src/App.js', existing)).toBe('src/App.js');
    });

    test('unique filename match', () => {
      expect(resolveFilePath('Button.js', existing)).toBe('src/components/Button.js');
    });

    test('longest suffix match', () => {
      expect(resolveFilePath('components/Button.js', existing)).toBe('src/components/Button.js');
    });

    test('fallback to provided path', () => {
      expect(resolveFilePath('new/file.js', existing)).toBe('new/file.js');
    });
  });

  describe('applySearchReplace', () => {
    const original = `function hello() {
  console.log("hello");
}

function world() {
  console.log("world");
}`;

    test('single block replacement', () => {
      const blocks = `<<<<<<< SEARCH
function world() {
  console.log("world");
}
=======
function world() {
  console.log("earth");
}
>>>>>>> REPLACE`;
      const result = applySearchReplace(original, blocks);
      expect(result.content).toContain('console.log("earth")');
      expect(result.diffs.length).toBe(1);
      expect(result.diffs[0].original).toContain('world');
    });

    test('multiple blocks', () => {
      const blocks = `<<<<<<< SEARCH
  console.log("hello");
=======
  console.log("hi");
>>>>>>> REPLACE
<<<<<<< SEARCH
  console.log("world");
=======
  console.log("everyone");
>>>>>>> REPLACE`;
      const result = applySearchReplace(original, blocks);
      expect(result.content).toContain('console.log("hi")');
      expect(result.content).toContain('console.log("everyone")');
      expect(result.diffs.length).toBe(2);
    });

    test('selectedLines overlap - allow', () => {
      const blocks = `<<<<<<< SEARCH
  console.log("hello");
=======
  console.log("hi");
>>>>>>> REPLACE`;
      // Line 2 is console.log("hello")
      const result = applySearchReplace(original, blocks, [2]);
      expect(result.content).toContain('console.log("hi")');
    });

    test('selectedLines overlap - deny', () => {
      const blocks = `<<<<<<< SEARCH
  console.log("world");
=======
  console.log("everyone");
>>>>>>> REPLACE`;
      // world is around line 6, if we select line 2 it should not apply
      const result = applySearchReplace(original, blocks, [2]);
      expect(result.content).toBe(original);
      expect(result.diffs.length).toBe(0);
    });
  });

  describe('computeDiff', () => {
    const original = 'one\ntwo\nthree';
    const updated = 'one\nchanged\nthree';

    test('detects change', () => {
      const result = computeDiff(original, updated);
      expect(result.content).toBe(updated);
      expect(result.diffs.length).toBe(1);
      expect(result.diffs[0].original).toBe('two');
    });

    test('filters by selectedLines', () => {
      // Line 2 is "two"
      const result = computeDiff(original, updated, [1]);
      expect(result.content).toBe(original);
      expect(result.diffs.length).toBe(0);
    });
  });

  describe('applyTargetedReplacement', () => {
    const original = 'line1\nline2\nline3\nline4';
    const snippet = 'new line 2\nnew line 3';

    test('replaces selected range', () => {
      const result = applyTargetedReplacement(original, snippet, [2, 3]);
      expect(result.content).toBe('line1\nnew line 2\nnew line 3\nline4');
      expect(result.diffs[0].original).toBe('line2\nline3');
    });
  });

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
      // Check if editorState was called to update content
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
      const aiResponse = 'Just some code without markers';
      // Mocking tabState with active file
      const result = await processAIResponse(
        aiResponse,
        null, // No FS
        mockLogState,
        mockSidebarState,
        mockEditorState,
        { activeTabId: 'active.js' },
      );

      expect(result).toBe(1);
    });
  });
});
