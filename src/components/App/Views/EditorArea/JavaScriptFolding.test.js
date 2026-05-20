import { describe, expect, it } from 'vitest';
import {
  applyFoldedContentEdit,
  getExpandedFoldedSelection,
  getVisibleFoldedContent,
} from './Folding';
import { getJavaScriptBlockFolds } from './JavaScriptFolding';

describe('JavaScriptFolding', () => {
  it('finds multiline JS and JSX block ranges while ignoring strings and comments', () => {
    const code = `function App() {
  const text = "not a } brace";
  // if (x) {
  if (text) {
    return (
      <div>
        {items.map((item) => {
          return <span>{item.label}</span>;
        })}
      </div>
    );
  }
}`;

    expect(getJavaScriptBlockFolds(code, 'App.jsx')).toEqual([
      { id: '1:13', startLine: 1, endLine: 13 },
      { id: '4:12', startLine: 4, endLine: 12 },
      { id: 'jsx:6:10:div', startLine: 6, endLine: 10, placeholder: ' ... </div>' },
      { id: '7:9', startLine: 7, endLine: 9 },
    ]);
  });

  it('finds multiline nested JSX element folds', () => {
    const code = `export function Card() {
  return (
    <section className="card">
      <header>
        <h2>Title</h2>
      </header>
      <main>
        <p>Body</p>
      </main>
    </section>
  );
}`;

    expect(getJavaScriptBlockFolds(code, 'Card.jsx')).toEqual([
      { id: '1:12', startLine: 1, endLine: 12 },
      { id: 'jsx:3:10:section', startLine: 3, endLine: 10, placeholder: ' ... </section>' },
      { id: 'jsx:4:6:header', startLine: 4, endLine: 6, placeholder: ' ... </header>' },
      { id: 'jsx:7:9:main', startLine: 7, endLine: 9, placeholder: ' ... </main>' },
    ]);
  });

  it('uses JSX placeholders when projecting folded content', () => {
    const code = `<section>
  <p>Body</p>
</section>
after();`;
    const folds = getJavaScriptBlockFolds(code, 'Card.jsx');
    const result = getVisibleFoldedContent(code, folds, ['jsx:1:3:section']);

    expect(result.content).toBe(`<section> ... </section>
after();`);
    expect(result.lineItems).toEqual([
      expect.objectContaining({ line: 1, placeholder: ' ... </section>' }),
      expect.objectContaining({ line: 4 }),
    ]);
    expect(result.hasCollapsedFolds).toBe(true);
  });

  it('applies edits from folded JSX projection back to the full source', () => {
    const code = `<section>
  <p>Body</p>
</section>
after();`;
    const folds = getJavaScriptBlockFolds(code, 'Card.jsx');
    const result = getVisibleFoldedContent(code, folds, ['jsx:1:3:section']);
    const edited = `<article> ... </section>
afterEdited();`;

    expect(applyFoldedContentEdit(code, edited, result.lineItems)).toBe(`<article>
  <p>Body</p>
</section>
afterEdited();`);
  });

  it('expands copied text across collapsed JSX content', () => {
    const code = `<section>
  <p>Body</p>
</section>
after();`;
    const folds = getJavaScriptBlockFolds(code, 'Card.jsx');
    const result = getVisibleFoldedContent(code, folds, ['jsx:1:3:section']);

    const selectionEnd = result.content.indexOf('\nafter();');

    expect(
      getExpandedFoldedSelection(code, result.content, result.lineItems, 0, selectionEnd),
    ).toBe(`<section>
  <p>Body</p>
</section>`);
  });

  it('supports TypeScript and ignores braces in template literal text', () => {
    const code = `export function render(value: string) {
  const template = \`literal } brace \${value.toUpperCase()}\`;
  return {
    value,
  };
}`;

    expect(getJavaScriptBlockFolds(code, 'render.ts')).toEqual([
      { id: '1:6', startLine: 1, endLine: 6 },
      { id: '3:5', startLine: 3, endLine: 5 },
    ]);
  });

  it('uses the shared folded-content projection for JS blocks', () => {
    const code = `if (enabled) {
  run();
}
cleanup();`;
    const folds = getJavaScriptBlockFolds(code, 'main.js');
    const result = getVisibleFoldedContent(code, folds, ['1:3']);

    expect(result.content).toBe(`if (enabled) { ... }
cleanup();`);
    expect(result.lineItems).toEqual([
      expect.objectContaining({ line: 1 }),
      expect.objectContaining({ line: 4 }),
    ]);
    expect(result.hasCollapsedFolds).toBe(true);
  });
});
