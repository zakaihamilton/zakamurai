import { createMockHighlightState, createMockPendingDiff } from '@/test-utils/editorMocks';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useHighlightLoader from './HighlightLoader';

vi.mock('./highlighter', () => ({
  highlightCode: vi.fn((content, _path, _state, _styles, _showFind, findQuery) =>
    findQuery ? `HL:${content}:${findQuery}` : `HL:${content}`,
  ),
}));

describe('useHighlightLoader', () => {
  const state = createMockHighlightState();

  it('highlights editor content by default', async () => {
    const { result } = renderHook(() =>
      useHighlightLoader({
        showSideBySide: false,
        hasDiff: false,
        localContent: 'local',
        editorContent: 'editor',
        filePath: 'a.js',
        state,
        showFind: false,
        findQuery: '',
        matchIndex: -1,
        suggestion: undefined,
        cursorPos: { line: 1, col: 1, index: 0 },
        navigationLinksEnabled: false,
        diffData: undefined,
      }),
    );

    expect(result.current.highlightedCode).toBe('HL:editor');
    expect(result.current.originalHighlightedCode).toBe('');
    await waitFor(() => {
      expect(result.current.highlightedCode).toBe('HL:editor');
    });
  });

  it('highlights local and original content in side-by-side diff mode', async () => {
    const { result } = renderHook(() =>
      useHighlightLoader({
        showSideBySide: true,
        hasDiff: true,
        localContent: 'local',
        editorContent: 'editor',
        filePath: 'a.js',
        state,
        showFind: true,
        findQuery: 'x',
        matchIndex: 0,
        suggestion: undefined,
        cursorPos: { line: 1, col: 1, index: 0 },
        navigationLinksEnabled: false,
        diffData: createMockPendingDiff({
          originalContent: 'original',
          modifiedContent: 'local',
        }),
      }),
    );

    expect(result.current.highlightedCode).toBe('HL:local:x');
    await waitFor(() => {
      expect(result.current.originalHighlightedCode).toBe('HL:original:x');
    });
  });
});
