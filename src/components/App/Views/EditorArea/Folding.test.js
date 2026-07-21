import { describe, expect, it } from 'vitest';
import {
  applyFoldedContentEdit,
  getExpandedFoldedSelection,
  getFoldStarts,
  getVisibleFoldedContent,
} from './Folding';

describe('Folding', () => {
  const folds = [{ id: '1:3', startLine: 1, endLine: 3 }];
  const code = 'function a() {\n  return 1;\n}';

  it('returns unchanged content when nothing is collapsed', () => {
    expect(getVisibleFoldedContent(code, folds, [])).toEqual({
      content: code,
      lineItems: [{ line: 1 }, { line: 2 }, { line: 3 }],
      hasCollapsedFolds: false,
    });
  });

  it('hides collapsed fold bodies and builds fold starts', () => {
    const folded = getVisibleFoldedContent(code, folds, ['1:3']);
    expect(folded.hasCollapsedFolds).toBe(true);
    expect(folded.content).toBe('function a() { ... }');
    expect(folded.lineItems).toHaveLength(1);
    expect(folded.lineItems[0].placeholder).toBe(' ... }');
    expect(getFoldStarts(folds)).toEqual({ 1: folds[0] });
  });

  it('applies edits on projected folded content back onto original lines', () => {
    const folded = getVisibleFoldedContent(code, folds, ['1:3']);
    const next = applyFoldedContentEdit(code, 'function b() { ... }', folded.lineItems);
    expect(next).toBe('function b() {\n  return 1;\n}');
  });

  it('expands selections across collapsed folds into original content', () => {
    const folded = getVisibleFoldedContent(code, folds, ['1:3']);
    const selection = getExpandedFoldedSelection(
      code,
      folded.content,
      folded.lineItems,
      0,
      folded.content.length,
    );
    expect(selection).toBe(code);
  });
});
