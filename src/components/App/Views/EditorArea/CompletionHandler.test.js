import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useCompletion, { COMPLETION_DEBOUNCE_MS, normalizeCompletion } from './CompletionHandler';

vi.mock('@/components/AI/WebLLMAPI', () => ({
  askWebLLM: vi.fn().mockResolvedValue('<completion>Done</completion>'),
}));

vi.mock('@/utils/rag/search-utility', () => ({
  ragSearch: {
    retrieveContext: vi.fn().mockResolvedValue([]),
    formatPromptContext: vi.fn().mockReturnValue(''),
    init: vi.fn().mockResolvedValue(undefined),
  },
}));

const { askWebLLM } = await import('@/components/AI/WebLLMAPI');
const { ragSearch } = await import('@/utils/rag/search-utility');

const flushCompletionDelay = async () => {
  await act(async () => {
    vi.advanceTimersByTime(20);
    await Promise.resolve();
  });
};

const flushProductionCompletionDelay = async () => {
  await act(async () => {
    vi.advanceTimersByTime(COMPLETION_DEBOUNCE_MS - 1);
    await Promise.resolve();
  });
};

describe('useCompletion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not request completion when only the cursor moves', async () => {
    const { rerender } = renderHook((props) => useCompletion(props), {
      initialProps: {
        localContent: 'const value = 1;',
        cursorPos: { line: 1, col: 6, index: 5 },
        filePath: 'test.js',
      },
    });

    rerender({
      localContent: 'const value = 1;',
      cursorPos: { line: 1, col: 12, index: 11 },
      filePath: 'test.js',
    });
    await flushCompletionDelay();

    expect(askWebLLM).not.toHaveBeenCalled();
  });

  it('pauses completion after Escape until the user edits', async () => {
    const { result, rerender } = renderHook((props) => useCompletion(props), {
      initialProps: {
        localContent: 'const val',
        cursorPos: { line: 1, col: 10, index: 9 },
        filePath: 'test.js',
      },
    });

    act(() => {
      result.current.cancelSuggestion({ pauseUntilEdit: true });
    });

    rerender({
      localContent: 'const val',
      cursorPos: { line: 1, col: 5, index: 4 },
      filePath: 'test.js',
    });
    await flushCompletionDelay();

    expect(askWebLLM).not.toHaveBeenCalled();

    rerender({
      localContent: 'const valu',
      cursorPos: { line: 1, col: 11, index: 10 },
      filePath: 'test.js',
    });
    await flushCompletionDelay();

    expect(askWebLLM).toHaveBeenCalledTimes(1);
  });

  it('keeps a typing-triggered completion pending when the cursor update follows the edit', async () => {
    const { rerender } = renderHook((props) => useCompletion(props), {
      initialProps: {
        localContent: 'const valu',
        cursorPos: { line: 1, col: 10, index: 9 },
        filePath: 'test.js',
      },
    });

    await act(async () => {
      await Promise.resolve();
    });

    rerender({
      localContent: 'const value',
      cursorPos: { line: 1, col: 10, index: 9 },
      filePath: 'test.js',
    });

    rerender({
      localContent: 'const value',
      cursorPos: { line: 1, col: 12, index: 11 },
      filePath: 'test.js',
    });

    await flushCompletionDelay();

    expect(askWebLLM).toHaveBeenCalledTimes(1);
  });

  it('shows loading while a completion is scheduled during debounce', async () => {
    const { result, rerender } = renderHook((props) => useCompletion(props), {
      initialProps: {
        localContent: 'const valu',
        cursorPos: { line: 1, col: 10, index: 9 },
        filePath: 'test.js',
      },
    });

    await act(async () => {
      await Promise.resolve();
    });

    rerender({
      localContent: 'const value',
      cursorPos: { line: 1, col: 12, index: 11 },
      filePath: 'test.js',
    });

    expect(result.current.loading).toBe(true);
    expect(askWebLLM).not.toHaveBeenCalled();
  });

  it('uses the latest edited content for completion requests', async () => {
    const { rerender } = renderHook((props) => useCompletion(props), {
      initialProps: {
        localContent: 'const a',
        cursorPos: { line: 1, col: 8, index: 7 },
        filePath: 'test.js',
      },
    });

    await act(async () => {
      await Promise.resolve();
    });

    rerender({
      localContent: 'const ab',
      cursorPos: { line: 1, col: 9, index: 8 },
      filePath: 'test.js',
    });
    rerender({
      localContent: 'const abc',
      cursorPos: { line: 1, col: 10, index: 9 },
      filePath: 'test.js',
    });

    await flushCompletionDelay();

    expect(askWebLLM).toHaveBeenCalledTimes(1);
    expect(askWebLLM.mock.calls[0][0]).toContain('const abc');
    expect(askWebLLM.mock.calls[0][0]).not.toContain('const ab▮');
  });

  it('uses a one second debounce outside tests', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const { rerender } = renderHook((props) => useCompletion(props), {
        initialProps: {
          localContent: 'const val',
          cursorPos: { line: 1, col: 10, index: 9 },
          filePath: 'test.js',
        },
      });

      await act(async () => {
        await Promise.resolve();
      });

      rerender({
        localContent: 'const valu',
        cursorPos: { line: 1, col: 11, index: 10 },
        filePath: 'test.js',
      });

      await flushProductionCompletionDelay();
      expect(askWebLLM).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1);
        await Promise.resolve();
      });
      expect(askWebLLM).toHaveBeenCalledTimes(1);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});

describe('normalizeCompletion', () => {
  it('removes code that already appears before the cursor', () => {
    const before = 'const message = "hel';
    const after = '";';

    expect(normalizeCompletion('"hello";', before, after)).toBe('lo');
  });

  it('removes the repeated current line before the cursor', () => {
    const before = 'function run() {\n  set';
    const after = '\n}';

    expect(normalizeCompletion('  setSuggestion(cleaned);', before, after)).toBe(
      'Suggestion(cleaned);',
    );
  });

  it('removes the repeated nearby statement before the cursor', () => {
    const before = 'const value = 1;\nconst mes';
    const after = '';

    expect(normalizeCompletion('const message = value;', before, after)).toBe('sage = value;');
  });

  it('removes repeated code before the cursor when indentation differs', () => {
    const before = 'if (enabled) {\n  const mes';
    const after = '\n}';

    expect(normalizeCompletion('    const message = "ready";', before, after)).toBe(
      'sage = "ready";',
    );
  });

  it('removes a repeated multi-line block before the cursor', () => {
    const before = 'function save() {\n  const value = getValue();\n  ret';
    const after = '\n}';

    expect(normalizeCompletion('  const value = getValue();\n  return value;', before, after)).toBe(
      'urn value;',
    );
  });

  it('removes code that already appears after the cursor', () => {
    const before = 'const count = ';
    const after = ';';

    expect(normalizeCompletion('10;', before, after)).toBe('10');
  });

  it('does not repeat className or opening brace inside JSX className expression', () => {
    const before = '<div className={';
    const after = '>';

    expect(normalizeCompletion('className={{styles.featureItem}', before, after)).toBe(
      'styles.featureItem}',
    );
  });

  it('removes a duplicated opening brace inside JSX className expression', () => {
    const before = '<div className={';
    const after = '>';

    expect(normalizeCompletion('{styles.featureItem}', before, after)).toBe('styles.featureItem}');
  });

  it('repairs plain text returned after a JSX opening angle in a repeated list item', () => {
    const before = [
      '        <ul className={styles.featuresList}>',
      '          <li className={styles.featureItem}><CheckIcon /> CSS Module Support</li>',
      '          <li className={styles.featureItem}><CheckIcon /> Hardware Accelerated</li>',
      '          <li className={styles.featureItem}><',
    ].join('\n');
    const after = '\n        </ul>';

    expect(normalizeCompletion('<completion>Feature Item</completion>', before, after)).toBe(
      'CheckIcon /> Feature Item</li>',
    );
  });

  it('closes the current JSX list item after a dangling angle following text', () => {
    const before = [
      '        <ul className={styles.featuresList}>',
      '          <li className={styles.featureItem}><CheckIcon /> CSS Module Support</li>',
      '          <li className={styles.featureItem}><CheckIcon /> Easy to use<',
    ].join('\n');
    const after = '\n        </ul>';

    expect(normalizeCompletion('<completion>CheckIcon()</completion>', before, after)).toBe('/li>');
  });

  it('strips labels and code fences without changing useful completion text', () => {
    const raw = '```js\nCompletion: return value;\n```';

    expect(normalizeCompletion(raw, '', '')).toBe('return value;');
  });

  it('uses only the text inside completion tags', () => {
    const raw =
      'I should complete the function call.\n<completion>.map((item) => item.id)</completion>';

    expect(normalizeCompletion(raw, 'items', '')).toBe('.map((item) => item.id)');
  });

  it('removes hidden reasoning blocks before extracting completion text', () => {
    const raw = '<think>The user probably wants a console call.</think>\nCompletion: log(value);';

    expect(normalizeCompletion(raw, 'console.', '')).toBe('log(value);');
  });

  it('drops explanatory lines before the actual code completion', () => {
    const raw = 'The cursor is after console.\nThe completion should call log.\nlog(value);';

    expect(normalizeCompletion(raw, 'console.', '')).toBe('log(value);');
  });

  it('drops implausibly long completions', () => {
    const raw = `<completion>${'x'.repeat(501)}</completion>`;

    expect(normalizeCompletion(raw, '', '')).toBe('');
  });

  it('truncates overly tall multi-line completions', () => {
    const raw = '<completion>1\n2\n3\n4\n5\n6\n7\n8\n9</completion>';

    expect(normalizeCompletion(raw, '', '')).toBe('1\n2\n3\n4\n5\n6\n7\n8');
  });
});
