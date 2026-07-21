import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RagSearchUtility } from './search-utility.js';

const { mockInit, mockSearch } = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockSearch: vi.fn(),
}));

vi.mock('./indexer-controller.js', () => {
  return {
    IndexerController: vi.fn().mockImplementation(() => {
      return {
        init: mockInit,
        search: mockSearch,
      };
    }),
  };
});

describe('RagSearchUtility', () => {
  let originalNavigator;

  beforeEach(() => {
    vi.clearAllMocks();
    originalNavigator = global.navigator;
  });

  afterEach(() => {
    global.navigator = originalNavigator;
  });

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

  it('retrieves and enriches context with CSS modules from OPFS', async () => {
    const mockFile = {
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue('.btn { color: red; }'),
      }),
    };
    const mockDir = {
      getDirectoryHandle: vi.fn().mockResolvedValue({
        getFileHandle: vi.fn().mockResolvedValue(mockFile),
      }),
      getFileHandle: vi.fn().mockResolvedValue(mockFile),
    };
    global.navigator = {
      storage: {
        getDirectory: vi.fn().mockResolvedValue(mockDir),
      },
    };

    mockInit.mockResolvedValue();
    mockSearch.mockResolvedValue([
      {
        filePath: 'components/Button.js',
        content: 'export function Button() {}',
        score: 0.9,
        cssLinks: JSON.stringify(['./Button.module.css']),
      },
    ]);

    const utility = new RagSearchUtility();
    const results = await utility.retrieveContext('button', 1);

    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('components/Button.js');
    expect(results[0].linkedCss).toHaveLength(1);
    expect(results[0].linkedCss[0].filePath).toBe('Button.module.css');
    expect(results[0].linkedCss[0].content).toBe('.btn { color: red; }');
  });

  it('handles OPFS read errors and parsing errors gracefully', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.navigator = {
      storage: {
        getDirectory: vi.fn().mockRejectedValue(new Error('Storage Denied')),
      },
    };

    mockInit.mockResolvedValue();
    mockSearch.mockResolvedValue([
      {
        filePath: 'components/Button.js',
        content: 'export function Button() {}',
        score: 0.9,
        // Calls _readOpfsFile but fails inside it (covering catch block)
        cssLinks: JSON.stringify(['Button.module.css']),
      },
      {
        filePath: 'components/Button.js',
        content: 'export function Button() {}',
        score: 0.9,
        // Causes JSON parsing error
        cssLinks: 'invalid-json-link-format',
      },
    ]);

    const utility = new RagSearchUtility();
    const results = await utility.retrieveContext('button', 2);

    expect(results).toHaveLength(2);
    expect(results[0].linkedCss).toHaveLength(0);
    expect(results[1].linkedCss).toHaveLength(0);
    expect(consoleWarn).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('handles relative path resolution containing parent segment ..', async () => {
    const mockFile = {
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue('.btn { color: blue; }'),
      }),
    };
    const mockDir = {
      getDirectoryHandle: vi.fn().mockResolvedValue({
        getFileHandle: vi.fn().mockResolvedValue(mockFile),
      }),
      getFileHandle: vi.fn().mockResolvedValue(mockFile),
    };
    global.navigator = {
      storage: {
        getDirectory: vi.fn().mockResolvedValue(mockDir),
      },
    };

    mockInit.mockResolvedValue();
    mockSearch.mockResolvedValue([
      {
        filePath: 'components/nested/Button.js',
        content: 'export function Button() {}',
        score: 0.9,
        cssLinks: JSON.stringify(['nested/../Button.module.css']),
      },
    ]);

    const utility = new RagSearchUtility();
    const results = await utility.retrieveContext('button', 1);
    expect(results[0].linkedCss).toHaveLength(1);
  });
});
