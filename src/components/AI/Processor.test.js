import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import {
  applyFileUpdate,
  applySearchReplace,
  applyTargetedReplacement,
  computeDiff,
  parseAIResponse,
  processAIResponse,
  resolveFilePath,
} from './Processor';

describe('AI Processor', () => {
  describe('parseAIResponse', () => {
    test('extracts multiple files', () => {
      const response = `
// --- File: one.js ---
content 1
// --- End File ---
// --- File: two.js ---
content 2
// --- End File ---
`;
      const blocks = parseAIResponse(response);
      expect(blocks.length).toBe(2);
      expect(blocks[0].filePath).toBe('one.js');
      expect(blocks[1].content).toBe('content 2');
    });

    test('fallback to activeTabId', () => {
      const response = 'just some code';
      const blocks = parseAIResponse(response, 'active.js');
      expect(blocks.length).toBe(1);
      expect(blocks[0].filePath).toBe('active.js');
    });

    test('fallback with markdown blocks', () => {
      const response = '```javascript\nfunction test() { return true; }\n```';
      const blocks = parseAIResponse(response, 'active.js');
      expect(blocks.length).toBe(1);
      expect(blocks[0].content).toBe('function test() { return true; }');
    });
  });

  describe('applyFileUpdate', () => {
    test('uses search/replace if marker present', () => {
      const original = 'line1\nline2';
      const update = '<<<<<<< SEARCH\nline1\n=======\nnew1\n>>>>>>> REPLACE';
      const result = applyFileUpdate(original, update);
      expect(result.content).toBe('new1\nline2');
    });

    test('uses targeted replacement for snippets', () => {
      const original = 'line1\nline2\nline3';
      const snippet = 'new line';
      // snippets are < 80% of original length
      const result = applyFileUpdate(original, snippet, [2]);
      expect(result.content).toBe('line1\nnew line\nline3');
    });
  });

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
  });
});
