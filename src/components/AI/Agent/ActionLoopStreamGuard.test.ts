import { describe, expect, it } from 'vitest';
import {
  hasDegenerateStreamRepetition,
  inspectStreamingActionOutput,
} from './ActionLoopStreamGuard';

describe('ActionLoopStreamGuard', () => {
  it('returns false on short or normal source streams', () => {
    expect(hasDegenerateStreamRepetition('short text')).toBe(false);
    expect(
      inspectStreamingActionOutput({
        output: '```jsx\nexport default function App() { return <main>Hello</main>; }\n```',
        lightweightModel: true,
      }),
    ).toBeNull();
  });

  it('detects degenerate line repetition loops', () => {
    const repeatedLines = Array.from(
      { length: 6 },
      () => '  const [count, setCount] = useState(0); // repeated line',
    ).join('\n');
    expect(hasDegenerateStreamRepetition(repeatedLines)).toBe(true);
    const result = inspectStreamingActionOutput({
      output: `\`\`\`jsx\n${repeatedLines}`,
      lightweightModel: true,
    });
    expect(result).toEqual(
      expect.objectContaining({
        action: 'abort-malformed',
        reason: 'repetition-loop',
      }),
    );
  });

  it('detects degenerate phrase repetition without newlines', () => {
    const phrase = 'export default function BrokenLoopComponent() { return null; } ';
    const output = phrase.repeat(5);
    expect(hasDegenerateStreamRepetition(output)).toBe(true);
  });

  it('truncates cleanly after a closed fence when a lightweight model appends trailing prose', () => {
    const cleanFence = [
      '```jsx',
      "import { useState } from 'react';",
      "import styles from './App.module.css';",
      'export default function App() {',
      '  const [count, setCount] = useState(0);',
      '  return <button className={styles.btn} onClick={() => setCount(count + 1)}>{count}</button>;',
      '}',
      '```',
    ].join('\n');
    const output = `${cleanFence}\n\nHere is an explanation of how this component works and why I wrote it this way.`;
    const result = inspectStreamingActionOutput({
      output,
      lightweightModel: true,
    });
    expect(result).toEqual({
      action: 'complete',
      text: cleanFence,
      reason: 'closed-fence',
    });
  });

  it('truncates cleanly when a write_file action has leading whitespace', () => {
    const cleanFence = [
      '{"action": "write_file", "path": "src/App.jsx"}',
      '```jsx',
      "import { useState } from 'react';",
      "import styles from './App.module.css';",
      'export default function App() {',
      '  const [count, setCount] = useState(0);',
      '  return <button className={styles.btn} onClick={() => setCount(count + 1)}>{count}</button>;',
      '}',
      '```',
    ].join('\n');
    const output = `\n${cleanFence}\n\nI have finished writing the file for you.`;
    const result = inspectStreamingActionOutput({
      output,
      lightweightModel: true,
    });
    expect(result).toEqual({
      action: 'complete',
      text: `\n${cleanFence}`,
      reason: 'closed-fence',
    });
  });

  it('aborts early when a JSX fence starts with an HTML document', () => {
    const output = [
      '```jsx',
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head><meta charset="UTF-8" /><title>App</title></head>',
      '<body><div id="root"></div><script src="/main.js"></script></body>',
      '</html>',
    ].join('\n');
    const result = inspectStreamingActionOutput({
      output,
      lightweightModel: false,
    });
    expect(result).toEqual(
      expect.objectContaining({
        action: 'abort-malformed',
        reason: 'html-document',
      }),
    );
  });

  it('aborts early when a JSX fence imports a forbidden state library', () => {
    const output = [
      '```jsx',
      "import { create } from 'zustand';",
      "import { useState } from 'react';",
      'const useStore = create((set) => ({ count: 0, inc: () => set((s) => ({ count: s.count + 1 })) }));',
      'export default function App() { return <div>Bad</div>; }',
    ].join('\n');
    const result = inspectStreamingActionOutput({
      output,
      lightweightModel: false,
    });
    expect(result).toEqual(
      expect.objectContaining({
        action: 'abort-malformed',
        reason: 'forbidden-state-library',
      }),
    );
  });
});
