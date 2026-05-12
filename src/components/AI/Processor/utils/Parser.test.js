import { describe, expect, test } from 'vitest';
import { parseAIResponse } from './Parser';

describe('Parser', () => {
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
  });
});
