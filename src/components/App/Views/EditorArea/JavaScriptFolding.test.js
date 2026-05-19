import { describe, expect, it } from 'vitest';
import { getVisibleFoldedContent } from './Folding';
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
      { id: '7:9', startLine: 7, endLine: 9 },
    ]);
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
    expect(result.lineItems).toEqual([{ line: 1 }, { line: 4 }]);
    expect(result.hasCollapsedFolds).toBe(true);
  });
});
