import { describe, expect, it } from 'vitest';
import { getVisibleFoldedContent } from './Folding';
import { getJsonObjectFolds } from './JsonFolding';

describe('JsonFolding', () => {
  it('finds multiline JSON object ranges and ignores braces in strings', () => {
    const code = `{
  "label": "not a } brace",
  "nested": {
    "enabled": true
  }
}`;

    expect(getJsonObjectFolds(code, 'settings.json')).toEqual([
      { id: '1:6', startLine: 1, endLine: 6 },
      { id: '3:5', startLine: 3, endLine: 5 },
    ]);
  });

  it('returns original content for non-JSON paths', () => {
    const code = `const value = {
  enabled: true
};`;

    expect(getJsonObjectFolds(code, 'App.js')).toEqual([]);
    expect(getVisibleFoldedContent(code, [], [])).toMatchObject({
      content: code,
      hasCollapsedFolds: false,
    });
  });

  it('builds visible content with hidden lines represented by the start line', () => {
    const code = `{
  "nested": {
    "enabled": true
  },
  "name": "Zaka"
}`;
    const folds = getJsonObjectFolds(code, 'settings.json');
    const result = getVisibleFoldedContent(code, folds, ['2:4']);

    expect(result.content).toBe(`{
  "nested": { ... },
  "name": "Zaka"
}`);
    expect(result.lineItems).toEqual([
      expect.objectContaining({ line: 1 }),
      expect.objectContaining({ line: 2 }),
      expect.objectContaining({ line: 5 }),
      expect.objectContaining({ line: 6 }),
    ]);
    expect(result.hasCollapsedFolds).toBe(true);
  });
});
