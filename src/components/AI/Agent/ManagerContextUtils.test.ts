import { describe, expect, it } from 'vitest';
import {
  contextText,
  rankHybridContextFiles,
  selectInitialContextFiles,
} from './ManagerContextUtils';

describe('ManagerContextUtils host assistance helpers', () => {
  it('limits initial context files for recovery-tier budgets', () => {
    const paths = [
      'src/App.jsx',
      'src/main.jsx',
      'package.json',
      'src/components/Card.jsx',
      'src/components/Card.module.css',
      'src/utils/helpers.ts',
      'README.md',
    ];
    expect(selectInitialContextFiles(paths, 'src/App.jsx', 2)).toEqual([
      'src/App.jsx',
      'src/main.jsx',
    ]);
    expect(selectInitialContextFiles(paths, null, 3)).toEqual([
      'src/App.jsx',
      'src/main.jsx',
      'package.json',
    ]);
  });

  it('clips assembled context text to the model budget', () => {
    const long = 'x'.repeat(4000);
    const clipped = contextText([{ tool: 'read_file', value: long, text: long }], 500);
    expect(clipped.length).toBeLessThanOrEqual(500);
  });

  it('ranks files with hybrid RRF combining lexical symbol matches and semantic RAG results', () => {
    const files = {
      'package.json': '{}',
      'src/App.jsx': 'export default function App() { return <div />; }',
      'src/components/ThemeSwitch.jsx':
        'export function ThemeSwitch() { return <button>Toggle dark mode</button>; }',
      'src/components/ThemeSwitch.module.css': '.toggle { background: black; }',
    };
    const ranked = rankHybridContextFiles({
      request: 'update the dark mode toggle button styling',
      files,
      semanticResults: [
        {
          filePath: 'src/components/ThemeSwitch.jsx',
          content: 'export function ThemeSwitch()',
          score: 0.85,
          linkedCss: [
            {
              filePath: 'src/components/ThemeSwitch.module.css',
              content: '.toggle { background: black; }',
            },
          ],
        },
      ],
      maxFiles: 3,
    });
    expect(ranked[0]).toBe('src/components/ThemeSwitch.jsx');
    expect(ranked).toContain('src/components/ThemeSwitch.module.css');
  });
});
