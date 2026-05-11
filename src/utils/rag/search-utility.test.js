import { describe, expect, it } from 'vitest';
import { RagSearchUtility } from './search-utility.js';

describe('RagSearchUtility', () => {
  it('formats retrieved context correctly with linked CSS', () => {
    const utility = new RagSearchUtility();

    const mockResults = [
      {
        filePath: 'Button.js',
        content:
          'export function Button() { return <button className={styles.btn}>Click</button>; }',
        score: 0.1,
        linkedCss: [
          {
            filePath: 'Button.module.css',
            content: '.btn { color: red; }',
          },
        ],
      },
    ];

    const formatted = utility.formatPromptContext(mockResults);

    expect(formatted).toContain('### Code Context from Workspace:');
    expect(formatted).toContain('--- File: Button.js ---');
    expect(formatted).toContain('export function Button');
    expect(formatted).toContain('--- Linked CSS: Button.module.css ---');
    expect(formatted).toContain('.btn { color: red; }');
    expect(formatted).toContain('### End Code Context');
  });

  it('handles empty results gracefully', () => {
    const utility = new RagSearchUtility();
    const formatted = utility.formatPromptContext([]);
    expect(formatted).toBe('');
  });
});
