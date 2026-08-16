import { describe, expect, it } from 'vitest';
import { contextText, selectInitialContextFiles } from './ManagerContextUtils';

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
});
