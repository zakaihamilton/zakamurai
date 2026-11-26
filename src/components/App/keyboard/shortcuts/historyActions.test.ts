import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEditorState, makeShortcutActionContext, makeTabState } from '@/test-utils/stateMocks';
import type { HistorySnapshot } from '@/types/domain-types';
import { redoShortcutAction, undoShortcutAction } from './historyActions';

describe('shortcuts/historyActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('undoShortcutAction', () => {
    it('does nothing when there is no activeTabId', () => {
      const editorState = makeEditorState({
        fileContents: { 'a.js': 'hello' },
      });
      const tabState = makeTabState({ activeTabId: null });

      undoShortcutAction(makeShortcutActionContext({ editorState, tabState }));

      expect(editorState).not.toHaveBeenCalled();
    });

    it('initializes missing history and returns when past is empty', () => {
      const editorState = makeEditorState({
        fileContents: { 'a.js': 'hello' },
        history: undefined,
        cursorPos: undefined,
      });
      const tabState = makeTabState({ activeTabId: 'a.js' });

      undoShortcutAction(makeShortcutActionContext({ editorState, tabState }));

      expect(editorState).toHaveBeenCalledTimes(1);
      expect(editorState.fileContents['a.js']).toBe('hello');
    });

    it('returns early when file history exists without past or with empty past', () => {
      const editorState = makeEditorState({
        fileContents: { 'a.js': 'hello' },
        history: {
          'a.js': {
            past: undefined as unknown as HistorySnapshot[],
            future: [],
          },
        },
      });
      const tabState = makeTabState({ activeTabId: 'a.js' });

      undoShortcutAction(makeShortcutActionContext({ editorState, tabState }));
      expect(editorState.fileContents['a.js']).toBe('hello');

      editorState((draft) => {
        draft.history = { 'a.js': { past: [], future: [] } };
      });
      undoShortcutAction(makeShortcutActionContext({ editorState, tabState }));
      expect(editorState.fileContents['a.js']).toBe('hello');
    });

    it('commits dirty buffers and restores lastSnapshotContent with lastSnapshotCursor', () => {
      const editorState = makeEditorState({
        fileContents: { 'a.js': 'saved' },
        dirtyBufferContents: { 'a.js': 'unsaved-typing' },
        cursorPos: { 'a.js': { line: 3, col: 4, index: 12 } },
        history: {
          'a.js': {
            past: [{ content: 'older', cursor: { line: 1, col: 1, index: 0 } }],
            future: undefined as unknown as HistorySnapshot[],
            lastSnapshotContent: 'snapshot',
            lastSnapshotCursor: { line: 2, col: 2, index: 5 },
          },
        },
      });
      const tabState = makeTabState({ activeTabId: 'a.js' });

      undoShortcutAction(makeShortcutActionContext({ editorState, tabState }));

      expect(editorState.dirtyBufferContents).toEqual({});
      expect(editorState.fileContents['a.js']).toBe('snapshot');
      expect(editorState.cursorPos?.['a.js']).toEqual({ line: 2, col: 2, index: 5 });
      expect(editorState.history?.['a.js']?.future).toEqual([
        { content: 'unsaved-typing', cursor: { line: 3, col: 4, index: 12 } },
      ]);
    });

    it('restores lastSnapshotContent without modifying cursor when lastSnapshotCursor is undefined', () => {
      const editorState = makeEditorState({
        fileContents: { 'a.js': 'current' },
        cursorPos: undefined,
        history: {
          'a.js': {
            past: [],
            future: [{ content: 'existing-future', cursor: { line: 1, col: 1, index: 0 } }],
            lastSnapshotContent: 'snapshot',
            lastSnapshotCursor: undefined,
          },
        },
      });
      const tabState = makeTabState({ activeTabId: 'a.js' });

      undoShortcutAction(makeShortcutActionContext({ editorState, tabState }));

      expect(editorState.fileContents['a.js']).toBe('snapshot');
      expect(editorState.cursorPos).toBeUndefined();
      expect(editorState.history?.['a.js']?.future).toEqual([
        { content: 'existing-future', cursor: { line: 1, col: 1, index: 0 } },
        { content: 'current', cursor: { line: 1, col: 1, index: 0 } },
      ]);
    });

    it('falls through to past stack when currentContent equals lastSnapshotContent', () => {
      const editorState = makeEditorState({
        fileContents: { 'a.js': 'snapshot' },
        cursorPos: { 'a.js': { line: 2, col: 3, index: 8 } },
        history: {
          'a.js': {
            past: [{ content: 'previous', cursor: { line: 1, col: 2, index: 1 } }],
            future: undefined as unknown as HistorySnapshot[],
            lastSnapshotContent: 'snapshot',
          },
        },
      });
      const tabState = makeTabState({ activeTabId: 'a.js' });

      undoShortcutAction(makeShortcutActionContext({ editorState, tabState }));

      expect(editorState.fileContents['a.js']).toBe('previous');
      expect(editorState.cursorPos?.['a.js']).toEqual({ line: 1, col: 2, index: 1 });
      expect(editorState.history?.['a.js']?.past).toEqual([]);
      expect(editorState.history?.['a.js']?.future).toEqual([
        { content: 'snapshot', cursor: { line: 2, col: 3, index: 8 } },
      ]);
    });

    it('pops past entry without cursor and uses default cursor when cursorPos is absent', () => {
      const editorState = makeEditorState({
        fileContents: { 'a.js': 'v2' },
        cursorPos: {},
        history: {
          'a.js': {
            past: [{ content: 'v1' } as HistorySnapshot],
            future: [],
          },
        },
      });
      const tabState = makeTabState({ activeTabId: 'a.js' });

      undoShortcutAction(makeShortcutActionContext({ editorState, tabState }));

      expect(editorState.fileContents['a.js']).toBe('v1');
      expect(editorState.cursorPos).toEqual({});
      expect(editorState.history?.['a.js']?.future).toEqual([
        { content: 'v2', cursor: { line: 1, col: 1, index: 0 } },
      ]);
    });

    it('returns early if popped past entry is falsy', () => {
      const editorState = makeEditorState({
        fileContents: { 'a.js': 'v2' },
        history: {
          'a.js': {
            past: [undefined as unknown as HistorySnapshot],
            future: [],
          },
        },
      });
      const tabState = makeTabState({ activeTabId: 'a.js' });

      undoShortcutAction(makeShortcutActionContext({ editorState, tabState }));

      expect(editorState.fileContents['a.js']).toBe('v2');
    });

    it('caps future history at 100 entries when undoing past entries or snapshot changes', () => {
      const fullFuture: HistorySnapshot[] = Array.from({ length: 100 }, (_, i) => ({
        content: `f-${i}`,
        cursor: { line: 1, col: 1, index: 0 },
      }));
      const editorState = makeEditorState({
        fileContents: { 'a.js': 'current' },
        history: {
          'a.js': {
            past: [{ content: 'older', cursor: { line: 1, col: 1, index: 0 } }],
            future: fullFuture,
          },
        },
      });
      const tabState = makeTabState({ activeTabId: 'a.js' });

      undoShortcutAction(makeShortcutActionContext({ editorState, tabState }));

      const nextFuture = editorState.history?.['a.js']?.future;
      expect(nextFuture).toHaveLength(100);
      expect(nextFuture?.[0]?.content).toBe('f-1');
      expect(nextFuture?.[99]?.content).toBe('current');
    });
  });

  describe('redoShortcutAction', () => {
    it('does nothing when there is no activeTabId', () => {
      const editorState = makeEditorState({
        fileContents: { 'a.js': 'hello' },
      });
      const tabState = makeTabState({ activeTabId: null });

      redoShortcutAction(makeShortcutActionContext({ editorState, tabState }));

      expect(editorState).not.toHaveBeenCalled();
    });

    it('returns early when history or file history entry is missing', () => {
      const editorState = makeEditorState({
        fileContents: { 'a.js': 'v1' },
        history: undefined,
      });
      const tabState = makeTabState({ activeTabId: 'a.js' });

      redoShortcutAction(makeShortcutActionContext({ editorState, tabState }));
      expect(editorState.fileContents['a.js']).toBe('v1');

      editorState((draft) => {
        draft.history = {};
      });
      redoShortcutAction(makeShortcutActionContext({ editorState, tabState }));
      expect(editorState.fileContents['a.js']).toBe('v1');
    });

    it('returns early when future stack is missing or empty', () => {
      const editorState = makeEditorState({
        fileContents: { 'a.js': 'v1' },
        history: {
          'a.js': {
            past: [],
            future: undefined as unknown as HistorySnapshot[],
          },
        },
      });
      const tabState = makeTabState({ activeTabId: 'a.js' });

      redoShortcutAction(makeShortcutActionContext({ editorState, tabState }));
      expect(editorState.fileContents['a.js']).toBe('v1');

      editorState((draft) => {
        draft.history = { 'a.js': { past: [], future: [] } };
      });
      redoShortcutAction(makeShortcutActionContext({ editorState, tabState }));
      expect(editorState.fileContents['a.js']).toBe('v1');
    });

    it('returns early if popped future entry is falsy', () => {
      const editorState = makeEditorState({
        fileContents: { 'a.js': 'v1' },
        history: {
          'a.js': {
            past: [],
            future: [undefined as unknown as HistorySnapshot],
          },
        },
      });
      const tabState = makeTabState({ activeTabId: 'a.js' });

      redoShortcutAction(makeShortcutActionContext({ editorState, tabState }));

      expect(editorState.fileContents['a.js']).toBe('v1');
    });

    it('commits dirty buffer, pops future state with cursor, and pushes current state to past', () => {
      const editorState = makeEditorState({
        fileContents: { 'a.js': 'v1' },
        dirtyBufferContents: { 'a.js': 'v1-dirty' },
        cursorPos: { 'a.js': { line: 4, col: 2, index: 10 } },
        history: {
          'a.js': {
            past: undefined as unknown as HistorySnapshot[],
            future: [{ content: 'v2', cursor: { line: 5, col: 1, index: 15 } }],
          },
        },
      });
      const tabState = makeTabState({ activeTabId: 'a.js' });

      redoShortcutAction(makeShortcutActionContext({ editorState, tabState }));

      expect(editorState.dirtyBufferContents).toEqual({});
      expect(editorState.fileContents['a.js']).toBe('v2');
      expect(editorState.cursorPos?.['a.js']).toEqual({ line: 5, col: 1, index: 15 });
      expect(editorState.history?.['a.js']?.future).toEqual([]);
      expect(editorState.history?.['a.js']?.past).toEqual([
        { content: 'v1-dirty', cursor: { line: 4, col: 2, index: 10 } },
      ]);
    });

    it('redoes entry without cursor and uses default cursor when cursorPos is missing', () => {
      const editorState = makeEditorState({
        fileContents: { 'a.js': 'v1' },
        cursorPos: undefined,
        history: {
          'a.js': {
            past: [{ content: 'v0', cursor: { line: 1, col: 1, index: 0 } }],
            future: [{ content: 'v2' } as HistorySnapshot],
          },
        },
      });
      const tabState = makeTabState({ activeTabId: 'a.js' });

      redoShortcutAction(makeShortcutActionContext({ editorState, tabState }));

      expect(editorState.fileContents['a.js']).toBe('v2');
      expect(editorState.cursorPos).toBeUndefined();
      expect(editorState.history?.['a.js']?.past).toEqual([
        { content: 'v0', cursor: { line: 1, col: 1, index: 0 } },
        { content: 'v1', cursor: { line: 1, col: 1, index: 0 } },
      ]);
    });
  });
});
