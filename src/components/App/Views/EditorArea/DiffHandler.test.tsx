import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import type { DiffActions, EditorFileSystem } from '@/components/App/Views/EditorArea/types';
import {
  createMockEditorState,
  createMockTabState,
  createSetLocalContentMock,
} from '@/test-utils/editorMocks';
import { makeSidebarState } from '@/test-utils/stateMocks';
import { act, render } from '@testing-library/react';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import DiffHandler from './DiffHandler';

vi.mock('@/components/Storage/Settings', () => ({
  default: {
    getTemplate: vi.fn(() => 'default'),
    setFileContents: vi.fn(),
    setPendingDiffs: vi.fn(),
  },
}));

vi.mock('@/components/App/Panes/Sidebar', () => ({
  SidebarState: {
    usePassiveState: vi.fn(),
  },
}));

vi.mock('@/components/App/Panes/TabBar', () => ({
  TabState: {
    usePassiveState: vi.fn(),
  },
}));

vi.mock('@/components/App/Panes/Sidebar/TreeUtils', () => ({
  removeNodeAtPath: vi.fn((tree) => tree),
}));

describe('DiffHandler', () => {
  let state: ReturnType<typeof createMockEditorState>;
  let tabState: ReturnType<typeof createMockTabState>;
  let sidebarState: ReturnType<typeof makeSidebarState>;
  let onStateChange: Mock<(actions: DiffActions) => void>;
  let setLocalContent: ReturnType<typeof createSetLocalContentMock>;
  let fs: EditorFileSystem & {
    writeFileAtPath: Mock;
    deleteFileAtPath: Mock;
    readFileAtPath?: Mock;
  };

  beforeEach(() => {
    state = createMockEditorState();
    tabState = createMockTabState({
      openTabs: [
        { id: 'a.js', type: 'file', label: 'a.js' },
        { id: 'b.js', type: 'file', label: 'b.js' },
      ],
      activeTabId: 'a.js',
    });
    sidebarState = makeSidebarState({
      folderTree: [{ name: 'root', type: 'folder', path: [], children: [] }],
    });
    onStateChange = vi.fn();
    setLocalContent = createSetLocalContentMock();
    fs = {
      mode: 'local',
      rootHandle: {} as FileSystemDirectoryHandle,
      writeFileAtPath: vi.fn().mockResolvedValue(undefined),
      deleteFileAtPath: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(SidebarState.usePassiveState).mockReturnValue(sidebarState);
    vi.mocked(TabState.usePassiveState).mockReturnValue(tabState);
  });

  const publishedActions = (): DiffActions => onStateChange.mock.calls[0][0] as DiffActions;

  it('publishes editor action handlers', () => {
    render(
      <DiffHandler
        filePath="a.js"
        localContent="next"
        setLocalContent={setLocalContent}
        state={state}
        fs={fs}
        onStateChange={onStateChange}
      />,
    );

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        handleApprove: expect.any(Function),
        handleUndo: expect.any(Function),
        toggleLine: expect.any(Function),
        handleCursorUpdate: expect.any(Function),
      }),
    );
  });

  it('approves a pending diff by clearing it and writing to the filesystem', async () => {
    state.pendingDiffs = {
      'a.js': { originalContent: 'old', modifiedContent: 'next', diffs: [] },
    };

    render(
      <DiffHandler
        filePath="a.js"
        localContent="next"
        setLocalContent={setLocalContent}
        state={state}
        fs={fs}
        onStateChange={onStateChange}
      />,
    );

    const { handleApprove } = publishedActions();
    await act(async () => {
      await handleApprove?.();
    });

    expect(state.pendingDiffs['a.js']).toBeUndefined();
    expect(fs.writeFileAtPath).toHaveBeenCalledWith('a.js', 'next');
  });

  it('keeps a pending diff when the mounted filesystem rejects the write', async () => {
    state.pendingDiffs = {
      'a.js': { originalContent: 'old', modifiedContent: 'next', diffs: [] },
    };
    fs.writeFileAtPath.mockResolvedValue(false);

    render(
      <DiffHandler
        filePath="a.js"
        localContent="next"
        setLocalContent={setLocalContent}
        state={state}
        fs={fs}
        onStateChange={onStateChange}
      />,
    );

    const { handleApprove } = publishedActions();
    await act(async () => {
      await handleApprove?.();
    });

    expect(state.pendingDiffs['a.js']).toEqual({
      originalContent: 'old',
      modifiedContent: 'next',
      diffs: [],
    });
  });

  it('undoes a pending diff and restores original content', async () => {
    state.pendingDiffs = {
      'a.js': {
        originalContent: 'old',
        modifiedContent: 'next',
        diffs: [],
        originalCursorPos: { line: 1, col: 1, index: 0 },
      },
    };

    render(
      <DiffHandler
        filePath="a.js"
        localContent="next"
        setLocalContent={setLocalContent}
        state={state}
        fs={fs}
        onStateChange={onStateChange}
      />,
    );

    const { handleUndo } = publishedActions();
    await act(async () => {
      await handleUndo?.();
    });

    expect(setLocalContent).toHaveBeenCalledWith('old');
    expect(state.fileContents['a.js']).toBe('old');
    expect(state.pendingDiffs['a.js']).toBeUndefined();
    expect(fs.writeFileAtPath).toHaveBeenCalledWith('a.js', 'old');
  });

  it('keeps a pending diff when the filesystem rejects an undo write', async () => {
    state.pendingDiffs = {
      'a.js': { originalContent: 'old', modifiedContent: 'next', diffs: [] },
    };
    fs.writeFileAtPath.mockResolvedValue(false);

    render(
      <DiffHandler
        filePath="a.js"
        localContent="next"
        setLocalContent={setLocalContent}
        state={state}
        fs={fs}
        onStateChange={onStateChange}
      />,
    );

    const { handleUndo } = publishedActions();
    await act(async () => {
      await handleUndo?.();
    });

    expect(state.pendingDiffs['a.js']).toBeDefined();
    expect(setLocalContent).not.toHaveBeenCalled();
  });

  it('toggles selected lines and updates cursor position', () => {
    render(
      <DiffHandler
        filePath="a.js"
        localContent="next"
        setLocalContent={setLocalContent}
        state={state}
        fs={fs}
        onStateChange={onStateChange}
      />,
    );

    const { toggleLine, handleCursorUpdate } = publishedActions();
    toggleLine?.(3);
    expect(state.selectedLines?.['a.js']).toEqual([3]);
    toggleLine?.(3);
    expect(state.selectedLines?.['a.js']).toEqual([]);

    handleCursorUpdate?.({ line: 2, col: 4, index: 5 });
    expect(state.cursorPos?.['a.js']).toEqual({ line: 2, col: 4, index: 5 });
  });

  it('approves pending deletions and clears related editor state', async () => {
    state.pendingDeletions = {
      'a.js': { originalContent: 'old', changeSetId: 'cs-1' },
    };
    fs.readFileAtPath = vi.fn().mockResolvedValue('old');
    fs.deleteFileAtPath.mockResolvedValue(true);

    render(
      <DiffHandler
        filePath="a.js"
        localContent="next"
        setLocalContent={setLocalContent}
        state={state}
        fs={fs}
        onStateChange={onStateChange}
      />,
    );

    const { handleApprove } = publishedActions();
    await act(async () => {
      await handleApprove?.();
    });

    expect(fs.deleteFileAtPath).toHaveBeenCalledWith('a.js');
    expect(state.pendingDeletions?.['a.js']).toBeUndefined();
    expect(tabState.openTabs).toEqual([{ id: 'b.js', type: 'file', label: 'b.js' }]);
  });

  it('marks a diff conflicted when the filesystem changed externally', async () => {
    state.pendingDiffs = {
      'a.js': { originalContent: 'old', modifiedContent: 'next', diffs: [], changeSetId: 'cs-1' },
    };
    fs.readFileAtPath = vi.fn().mockResolvedValue('changed on disk');

    render(
      <DiffHandler
        filePath="a.js"
        localContent="next"
        setLocalContent={setLocalContent}
        state={state}
        fs={fs}
        onStateChange={onStateChange}
      />,
    );

    const { handleApprove } = publishedActions();
    await act(async () => {
      await handleApprove?.();
    });

    expect(fs.writeFileAtPath).not.toHaveBeenCalled();
    expect(state.pendingDiffs['a.js']).toBeDefined();
  });

  it('undoes pending deletions without touching the filesystem', async () => {
    state.pendingDeletions = {
      'a.js': { originalContent: 'old', changeSetId: 'cs-1' },
    };

    render(
      <DiffHandler
        filePath="a.js"
        localContent="next"
        setLocalContent={setLocalContent}
        state={state}
        fs={fs}
        onStateChange={onStateChange}
      />,
    );

    const { handleUndo } = publishedActions();
    await act(async () => {
      await handleUndo?.();
    });

    expect(state.pendingDeletions?.['a.js']).toBeUndefined();
    expect(fs.writeFileAtPath).not.toHaveBeenCalled();
  });

  it('treats missing files and write failures as non-destructive conflicts', async () => {
    state.pendingDiffs = {
      'a.js': { originalContent: 'old', modifiedContent: 'next', diffs: [], changeSetId: 'cs-1' },
    };
    fs.readFileAtPath = vi.fn().mockRejectedValue(new Error('missing'));
    fs.writeFileAtPath.mockRejectedValue(new Error('disk full'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <DiffHandler
        filePath="a.js"
        localContent="next"
        setLocalContent={setLocalContent}
        state={state}
        fs={fs}
        onStateChange={onStateChange}
      />,
    );

    const { handleApprove, handleCursorUpdate } = publishedActions();
    await act(async () => {
      await handleApprove?.();
    });
    expect(warn).toHaveBeenCalled();

    state.pendingDiffs = {
      'a.js': { originalContent: '', modifiedContent: 'next', diffs: [], changeSetId: 'cs-1' },
    };
    await act(async () => {
      await handleApprove?.();
    });
    expect(error).toHaveBeenCalled();

    handleCursorUpdate?.({ line: 2, col: 4, index: 5 });
    handleCursorUpdate?.({ line: 2, col: 4, index: 5 });
    expect(state.cursorPos?.['a.js']).toEqual({ line: 2, col: 4, index: 5 });

    warn.mockRestore();
    error.mockRestore();
  });

  it('skips filesystem work when no root handle is present', async () => {
    state.pendingDiffs = {
      'a.js': {
        originalContent: 'old',
        modifiedContent: 'next',
        diffs: [],
        originalCursorPos: undefined,
        changeSetId: 'cs-1',
      },
    };
    const fsWithoutRoot: EditorFileSystem = {
      mode: 'local',
      rootHandle: null,
      writeFileAtPath: vi.fn(),
      readFileAtPath: vi.fn(),
    };

    render(
      <DiffHandler
        filePath="a.js"
        localContent="next"
        setLocalContent={setLocalContent}
        state={state}
        fs={fsWithoutRoot}
        onStateChange={onStateChange}
      />,
    );

    const { handleApprove, handleUndo } = publishedActions();
    await act(async () => {
      await handleApprove?.();
    });
    expect(state.pendingDiffs['a.js']).toBeUndefined();
    expect(fsWithoutRoot.writeFileAtPath).not.toHaveBeenCalled();

    state.pendingDiffs = {
      'a.js': { originalContent: 'old', modifiedContent: 'next', diffs: [], changeSetId: 'cs-1' },
    };
    await act(async () => {
      await handleUndo?.();
    });
    expect(setLocalContent).toHaveBeenCalledWith('old');
  });
});
