import { describe, expect, it } from 'vitest';
import { formatCode } from './formatter';

describe('formatter', () => {
  it('formats JSON correctly', () => {
    const input = '{"a":1,"b":[1,2,3]}';
    const output = formatCode(input, 'test.json');
    expect(output).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2,\n    3\n  ]\n}');
  });

  it('formats CSS correctly', () => {
    const input2 = '.btn {\ncolor: red;\n}';
    const output2 = formatCode(input2, 'test.css');
    expect(output2).toBe('.btn {\n  color: red;\n}');
  });

  it('formats JS correctly', () => {
    const input = 'function test() {\nif(true) {\nconsole.log("hello");\n}\n}';
    const output = formatCode(input, 'test.js');
    expect(output).toBe('function test() {\n  if(true) {\n    console.log("hello");\n  }\n}');
  });

  it('handles closing brackets on the same line', () => {
    const input =
      'function test() {\n  if(true) {\n    console.log("hello");\n    } else {\n    console.log("world");\n  }\n}';
    const output = formatCode(input, 'test.js');
    expect(output).toBe(
      'function test() {\n  if(true) {\n    console.log("hello");\n  } else {\n    console.log("world");\n  }\n}',
    );
  });

  it('ignores brackets in strings', () => {
    const input = 'const s = "{";\nif(true) {\nconsole.log(s);\n}';
    const output = formatCode(input, 'test.js');
    expect(output).toBe('const s = "{";\nif(true) {\n  console.log(s);\n}');
  });

  it('ignores brackets in comments', () => {
    const input = 'if(true) {\n// {\nconsole.log("hi");\n}';
    const output = formatCode(input, 'test.js');
    expect(output).toBe('if(true) {\n  // {\n  console.log("hi");\n}');
  });

  it('formats JSX correctly', () => {
    const input =
      'function App() {\nreturn (\n<div className="app">\n<header>\n<h1>Hello World</h1>\n</header>\n<main>\n<p>Content</p>\n<img src="logo.png" />\n</main>\n</div>\n);\n}';
    const output = formatCode(input, 'App.jsx');
    expect(output).toBe(
      'function App() {\n  return (\n    <div className="app">\n      <header>\n        <h1>Hello World</h1>\n      </header>\n      <main>\n        <p>Content</p>\n        <img src="logo.png" />\n      </main>\n    </div>\n  );\n}',
    );
  });
});
