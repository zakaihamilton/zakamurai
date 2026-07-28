import * as fc from 'fast-check';
import { describe, expect, test, vi } from 'vitest';
import { parseAIPlan, parseAIResponse } from './Parser';

describe('Parser', () => {
  describe('parseAIPlan', () => {
    test('parses structured planning output', () => {
      const planText = `
// --- Plan ---
- Objective: Modernize button styling
- Files to modify: src/Button.js, src/Button.css
- Key changes:
  - Add primary variant
  - Update hover state
// --- End Plan ---
`;
      const parsed = parseAIPlan(planText);
      expect(parsed.objective).toBe('Modernize button styling');
      expect(parsed.filesToModify).toEqual(['src/Button.js', 'src/Button.css']);
      expect(parsed.keyChanges).toEqual(['Add primary variant', 'Update hover state']);
    });

    test('returns empty plan for non-string input', () => {
      expect(parseAIPlan(null)).toEqual({
        objective: '',
        filesToModify: [],
        keyChanges: [],
      });
    });

    test('parses plan fields from unstructured text', () => {
      const parsed = parseAIPlan(
        '- Objective: Ship feature\n- Files to modify: src/a.js, src/b.js',
      );
      expect(parsed.objective).toBe('Ship feature');
      expect(parsed.filesToModify).toEqual(['src/a.js', 'src/b.js']);
    });
  });

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

    test('handles AI self-correction (duplicate files)', () => {
      const response = `
// --- File: app.js ---
partial content...
sorry I made a mistake
// --- File: app.js ---
corrected content
// --- End File ---
`;
      const blocks = parseAIResponse(response);
      expect(blocks.length).toBe(1);
      expect(blocks[0].filePath).toBe('app.js');
      expect(blocks[0].content).toBe('corrected content');
    });

    test('handles internal restarts with separators', () => {
      const response = `
// --- File: app.css ---
.container { background: #00
===
.container { background: #006400; }
// --- End File ---
`;
      const blocks = parseAIResponse(response);
      expect(blocks.length).toBe(1);
      expect(blocks[0].content).toBe('.container { background: #006400; }');
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

    test('preserves complete SEARCH/REPLACE blocks', () => {
      const response = `
// --- File: app.js ---
<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE
// --- End File ---
`;
      const blocks = parseAIResponse(response);
      expect(blocks[0].content).toContain('<<<<<<< SEARCH');
      expect(blocks[0].content).toContain('old');
      expect(blocks[0].content).toContain('>>>>>>> REPLACE');
    });

    test('skips files containing refusal patterns', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const response = `
// --- File: refuse.js ---
I apologize, but I cannot assist you with this request.
// --- End File ---
`;
      const blocks = parseAIResponse(response);
      expect(blocks).toHaveLength(0);
      expect(consoleWarn).toHaveBeenCalledOnce();
    });

    test('skips files containing abbreviation patterns', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const response = `
// --- File: incomplete.js ---
function test() {
  // rest of code
}
// --- End File ---
`;
      const blocks = parseAIResponse(response);
      expect(blocks).toHaveLength(0);
      expect(consoleWarn).toHaveBeenCalledOnce();
    });

    test('skips truncated response blocks ending in partial token', () => {
      const response = '// --- File: app.js ---\nconst a = \n<\n// --- File ---';
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const blocks = parseAIResponse(response);
      expect(blocks).toHaveLength(0);
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    test('strips surrounding brackets if block has [...] format', () => {
      const response = `// --- File: app.js ---
[
const ready = true;
]
// --- End File ---`;
      const blocks = parseAIResponse(response);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].content).toBe('const ready = true;');
    });

    test('keeps SEARCH blocks when internal restart markers are present', () => {
      const response = `
// --- File: app.js ---
<<<<<<< SEARCH
old line
=======
new line
>>>>>>> REPLACE
// --- End File ---
`;
      const blocks = parseAIResponse(response);
      expect(blocks[0].content).toContain('<<<<<<< SEARCH');
      expect(blocks[0].content).toContain('new line');
    });

    test('uses last segment after separator when apology precedes correction', () => {
      const response = `
// --- File: app.js ---
sorry I made a mistake here
---
export const fixed = true;
// --- End File ---
`;
      const blocks = parseAIResponse(response);
      expect(blocks[0].content).toBe('export const fixed = true;');
    });

    test('cleans restart keywords from unstructured code blocks', () => {
      const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
      const response = `
// --- File: app.js ---
Sorry for the confusion. Here is the correct implementation
export const value = 1;
// --- End File ---
`;
      const blocks = parseAIResponse(response);
      expect(blocks[0].content).toBe('export const value = 1;');
      expect(consoleInfo).toHaveBeenCalled();
      consoleInfo.mockRestore();
    });

    test('skips structured markdown files from truncation heuristics', () => {
      const response = '// --- File: notes.md ---\nShort\n// --- File ---';
      const blocks = parseAIResponse(response);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].filePath).toBe('notes.md');
    });

    test('skips abbreviation placeholders like REPLACE_WITH_ACTUAL_CONTENT', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const response = `
// --- File: stub.js ---
const x = REPLACE_WITH_ACTUAL_CONTENT;
// --- End File ---
`;
      const blocks = parseAIResponse(response);
      expect(blocks).toHaveLength(0);
      consoleWarn.mockRestore();
    });

    test('filters apology chatter and hallucinated labels from code', () => {
      const response = `
// --- File: app.js ---
s
sorry about that
Vendor A: fake label
- [teacher]
const real = 1;
// --- End File ---
`;
      const blocks = parseAIResponse(response);
      expect(blocks[0].content).toBe('const real = 1;');
    });

    test('preserves lines containing NEW LINE in comment stripping', () => {
      const response = `
// --- File: app.js ---
const a = 1; // NEW LINE marker kept
// --- End File ---
`;
      const blocks = parseAIResponse(response);
      expect(blocks[0].content).toContain('NEW LINE marker kept');
    });

    test('does not fallback when active tab content is too short', () => {
      const blocks = parseAIResponse('short', 'active.js');
      expect(blocks).toHaveLength(0);
    });

    test('round-trips file blocks through parseAIResponse (property)', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-z0-9_-]*\.js$/),
          fc.string({ minLength: 3, maxLength: 80 }).filter((s) => s.trim().length >= 3),
          (filePath, content) => {
            const response = `// --- File: ${filePath} ---\n${content}\n// --- End File ---`;
            const blocks = parseAIResponse(response);
            expect(blocks).toHaveLength(1);
            expect(blocks[0].filePath).toBe(filePath);
            expect(blocks[0].content).toContain(content.trim());
          },
        ),
      );
    });
  });
});
