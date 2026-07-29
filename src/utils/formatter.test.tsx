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
  it('formats JSX fragments correctly', () => {
    const input = '<>\n<div>Hello</div>\n</>';
    const output = formatCode(input, 'test.jsx');
    expect(output).toBe('<>\n  <div>Hello</div>\n</>');
  });

  it('does not indent for comparison operators', () => {
    const input = 'if (a<b) {\nconsole.log(1);\n}';
    const output = formatCode(input, 'test.js');
    expect(output).toBe('if (a<b) {\n  console.log(1);\n}');
  });

  it('handles multi-line tags correctly', () => {
    const input = '<div\nclassName="test"\n>\n<span>Hi</span>\n</div>';
    const output = formatCode(input, 'test.jsx');
    expect(output).toBe('<div\n  className="test"\n>\n  <span>Hi</span>\n</div>');
  });
  it('does not break on URLs in strings', () => {
    const input = 'const url = "https://google.com";\nif (true) {\nconsole.log(url);\n}';
    const output = formatCode(input, 'test.js');
    expect(output).toBe('const url = "https://google.com";\nif (true) {\n  console.log(url);\n}');
  });
  it('handles brackets after URLs on the same line', () => {
    const input = 'const url = "https://google.com"; if (true) {\nconsole.log(url);\n}';
    const output = formatCode(input, 'test.js');
    expect(output).toBe('const url = "https://google.com"; if (true) {\n  console.log(url);\n}');
  });

  it('formats SVG correctly', () => {
    const input =
      '<svg width="100" height="100"><g><circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" /><path d="M150 0 L75 200 L225 200 Z" /></g></svg>';
    const output = formatCode(input, 'image.svg');
    expect(output).toBe(
      '<svg width="100" height="100">\n  <g>\n    <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" />\n    <path d="M150 0 L75 200 L225 200 Z" />\n  </g>\n</svg>',
    );
  });

  it('formats multi-line SVG tags correctly', () => {
    const input = '<svg\nwidth="100"\nheight="100"\n>\n<path\nd="M10 10"\nfill="none"\n/>\n</svg>';
    const output = formatCode(input, 'image.svg');
    expect(output).toBe(
      '<svg\n  width="100"\n  height="100"\n>\n  <path\n    d="M10 10"\n    fill="none"\n  />\n</svg>',
    );
  });

  it('returns empty code unchanged', () => {
    expect(formatCode('', 'test.js')).toBe('');
  });

  it('formats TypeScript and TSX files', () => {
    const tsInput = 'function greet(name: string) {\nreturn name;\n}';
    expect(formatCode(tsInput, 'greet.ts')).toBe(
      'function greet(name: string) {\n  return name;\n}',
    );

    const tsxInput = 'export const App = () => {\nreturn <div>Hi</div>;\n};';
    expect(formatCode(tsxInput, 'App.tsx')).toBe(
      'export const App = () => {\n  return <div>Hi</div>;\n};',
    );
  });

  it('formats HTML comments inside SVG', () => {
    const input = '<svg><!-- comment --><rect /></svg>';
    const output = formatCode(input, 'icon.svg');
    expect(output).toContain('<!-- comment -->');
    expect(output).toContain('<rect />');
  });

  it('does not treat braces inside backtick strings as code blocks', () => {
    const input = 'const tpl = `value is ${obj.prop}`;\nif (true) {\nconsole.log(tpl);\n}';
    const output = formatCode(input, 'test.js');
    expect(output).toBe('const tpl = `value is ${obj.prop}`;\nif (true) {\n  console.log(tpl);\n}');
  });

  it('returns invalid JSON unchanged when parse fails', () => {
    const invalid = '{ invalid json }';
    expect(formatCode(invalid, 'broken.json')).toBe(invalid);
  });

  it('handles block comments spanning multiple lines', () => {
    const input = 'if (true) {\n/* {\nblock\n} */\nconsole.log(1);\n}';
    const output = formatCode(input, 'test.js');
    expect(output).toBe('if (true) {\n  /* {\n  block\n  } */\n  console.log(1);\n}');
  });
});
