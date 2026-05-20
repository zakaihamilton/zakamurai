import { describe, expect, it } from 'vitest';
import { getCssBlockFolds } from './CssFolding';
import { getVisibleFoldedContent } from './Folding';

describe('CssFolding', () => {
  it('finds multiline CSS block ranges and ignores braces in strings and comments', () => {
    const code = `.button {
  content: "not a } brace";
  color: red;
}

/* .ignored {
  color: blue;
} */

@media (min-width: 700px) {
  .button {
    color: green;
  }
}`;

    expect(getCssBlockFolds(code, 'styles.css')).toEqual([
      { id: '1:4', startLine: 1, endLine: 4 },
      { id: '10:14', startLine: 10, endLine: 14 },
      { id: '11:13', startLine: 11, endLine: 13 },
    ]);
  });

  it('returns no ranges for non-CSS paths', () => {
    const code = `.button {
  color: red;
}`;

    expect(getCssBlockFolds(code, 'styles.js')).toEqual([]);
  });

  it('uses the shared folded-content projection for CSS blocks', () => {
    const code = `.button {
  color: red;
}
.link {
  color: blue;
}`;
    const folds = getCssBlockFolds(code, 'styles.css');
    const result = getVisibleFoldedContent(code, folds, ['1:3']);

    expect(result.content).toBe(`.button { ... }
.link {
  color: blue;
}`);
    expect(result.lineItems).toEqual([
      expect.objectContaining({ line: 1 }),
      expect.objectContaining({ line: 4 }),
      expect.objectContaining({ line: 5 }),
      expect.objectContaining({ line: 6 }),
    ]);
    expect(result.hasCollapsedFolds).toBe(true);
  });
});
