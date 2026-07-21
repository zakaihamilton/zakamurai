import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useHighlightLoader from './HighlightLoader';

vi.mock('./highlighter', () => ({
  highlightCode: vi.fn((content, _path, _state, _styles, _showFind, findQuery) =>
    findQuery ? `HL:${content}:${findQuery}` : `HL:${content}`,
  ),
}));

describe('useHighlightLoader', () => {
  const styles = {};
  const state = {
    pendingDiffs: {},
    selectedLines: {},
    fileContents: {},
    cursorPos: {},
  };

  it('highlights editor content by default', () => {
    const { result } = renderHook(() =>
      useHighlightLoader({
        showSideBySide: false,
        hasDiff: false,
        localContent: 'local',
        editorContent: 'editor',
        filePath: 'a.js',
        state,
        styles,
        showFind: false,
        findQuery: '',
        matchIndex: -1,
        suggestion: null,
        cursorPos: { line: 1, col: 1 },
        navigationLinksEnabled: false,
        diffData: null,
      }),
    );

    expect(result.current.highlightedCode).toBe('HL:editor');
    expect(result.current.originalHighlightedCode).toBe('');
  });

  it('highlights local and original content in side-by-side diff mode', () => {
    const { result } = renderHook(() =>
      useHighlightLoader({
        showSideBySide: true,
        hasDiff: true,
        localContent: 'local',
        editorContent: 'editor',
        filePath: 'a.js',
        state,
        styles,
        showFind: true,
        findQuery: 'x',
        matchIndex: 0,
        suggestion: null,
        cursorPos: { line: 1, col: 1 },
        navigationLinksEnabled: false,
        diffData: { originalContent: 'original' },
      }),
    );

    expect(result.current.highlightedCode).toBe('HL:local:x');
    expect(result.current.originalHighlightedCode).toBe('HL:original:x');
  });
});
