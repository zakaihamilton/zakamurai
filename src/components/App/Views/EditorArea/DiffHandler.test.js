import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DiffHandler from './DiffHandler';

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

import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';

describe('DiffHandler', () => {
  let state;
  let tabState;
  let sidebarState;
  let onStateChange;
  let setLocalContent;
  let fs;

  beforeEach(() => {
    state = Object.assign(
      vi.fn((updater) => {
        if (typeof updater === 'function') {
          const draft = {
            pendingDiffs: { ...(state.pendingDiffs || {}) },
            pendingDeletions: { ...(state.pendingDeletions || {}) },
            fileContents: { ...(state.fileContents || {}) },
            cursorPos: { ...(state.cursorPos || {}) },
            selectedLines: { ...(state.selectedLines || {}) },
            lastSaved: state.lastSaved,
          };
          updater(draft);
          Object.assign(state, draft);
        }
      }),
      {
        pendingDiffs: {},
        pendingDeletions: {},
        fileContents: {},
        cursorPos: {},
        selectedLines: {},
      },
    );
    tabState = Object.assign(
      vi.fn((updater) => updater(tabState)),
      {
        openTabs: [{ id: 'a.js' }, { id: 'b.js' }],
        activeTabId: 'a.js',
      },
    );
    sidebarState = Object.assign(
      vi.fn((updater) => updater(sidebarState)),
      {
        folderTree: { name: 'root', children: [] },
      },
    );
    onStateChange = vi.fn();
    setLocalContent = vi.fn();
    fs = {
      rootHandle: {},
      writeFileAtPath: vi.fn().mockResolvedValue(undefined),
      deleteFileAtPath: vi.fn().mockResolvedValue(undefined),
    };

    SidebarState.usePassiveState.mockReturnValue(sidebarState);
    TabState.usePassiveState.mockReturnValue(tabState);
  });

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
    state.pendingDiffs = { 'a.js': { originalContent: 'old' } };

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

    const { handleApprove } = onStateChange.mock.calls[0][0];
    await act(async () => {
      await handleApprove();
    });

    expect(state.pendingDiffs['a.js']).toBeUndefined();
    expect(fs.writeFileAtPath).toHaveBeenCalledWith('a.js', 'next');
  });

  it('keeps a pending diff when the mounted filesystem rejects the write', async () => {
    state.pendingDiffs = { 'a.js': { originalContent: 'old' } };
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

    const { handleApprove } = onStateChange.mock.calls[0][0];
    await act(async () => {
      await handleApprove();
    });

    expect(state.pendingDiffs['a.js']).toEqual({ originalContent: 'old' });
  });

  it('undoes a pending diff and restores original content', async () => {
    state.pendingDiffs = {
      'a.js': {
        originalContent: 'old',
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

    const { handleUndo } = onStateChange.mock.calls[0][0];
    await act(async () => {
      await handleUndo();
    });

    expect(setLocalContent).toHaveBeenCalledWith('old');
    expect(state.fileContents['a.js']).toBe('old');
    expect(state.pendingDiffs['a.js']).toBeUndefined();
    expect(fs.writeFileAtPath).toHaveBeenCalledWith('a.js', 'old');
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

    const { toggleLine, handleCursorUpdate } = onStateChange.mock.calls[0][0];
    toggleLine(3);
    expect(state.selectedLines['a.js']).toEqual([3]);
    toggleLine(3);
    expect(state.selectedLines['a.js']).toEqual([]);

    handleCursorUpdate({ line: 2, col: 4, index: 5 });
    expect(state.cursorPos['a.js']).toEqual({ line: 2, col: 4, index: 5 });
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

    const { handleApprove } = onStateChange.mock.calls[0][0];
    await act(async () => {
      await handleApprove();
    });

    expect(fs.deleteFileAtPath).toHaveBeenCalledWith('a.js');
    expect(state.pendingDeletions['a.js']).toBeUndefined();
    expect(tabState.openTabs).toEqual([{ id: 'b.js' }]);
  });

  it('marks a diff conflicted when the filesystem changed externally', async () => {
    const updateChangeSetFile = vi.fn();
    vi.doMock('@/components/Workspace', () => ({
      ChangeSetState: { usePassiveState: () => ({}) },
      updateChangeSetFile,
    }));

    state.pendingDiffs = {
      'a.js': { originalContent: 'old', changeSetId: 'cs-1' },
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

    const { handleApprove } = onStateChange.mock.calls[0][0];
    await act(async () => {
      await handleApprove();
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

    const { handleUndo } = onStateChange.mock.calls[0][0];
    await act(async () => {
      await handleUndo();
    });

    expect(state.pendingDeletions['a.js']).toBeUndefined();
    expect(fs.writeFileAtPath).not.toHaveBeenCalled();
  });

  it('treats missing files and write failures as non-destructive conflicts', async () => {
    state.pendingDiffs = { 'a.js': { originalContent: 'old', changeSetId: 'cs-1' } };
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

    const { handleApprove, handleCursorUpdate } = onStateChange.mock.calls[0][0];
    await act(async () => {
      await handleApprove();
    });
    expect(warn).toHaveBeenCalled();

    state.pendingDiffs = { 'a.js': { originalContent: '', changeSetId: 'cs-1' } };
    await act(async () => {
      await handleApprove();
    });
    expect(error).toHaveBeenCalled();

    handleCursorUpdate({ line: 2, col: 4, index: 5 });
    handleCursorUpdate({ line: 2, col: 4, index: 5 });
    expect(state.cursorPos['a.js']).toEqual({ line: 2, col: 4, index: 5 });

    warn.mockRestore();
    error.mockRestore();
  });

  it('skips filesystem work when no root handle is present', async () => {
    state.pendingDiffs = {
      'a.js': { originalContent: 'old', originalCursorPos: null, changeSetId: 'cs-1' },
    };
    const fsWithoutRoot = { rootHandle: null, writeFileAtPath: vi.fn(), readFileAtPath: vi.fn() };

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

    const { handleApprove, handleUndo } = onStateChange.mock.calls[0][0];
    await act(async () => {
      await handleApprove();
    });
    expect(state.pendingDiffs['a.js']).toBeUndefined();
    expect(fsWithoutRoot.writeFileAtPath).not.toHaveBeenCalled();

    state.pendingDiffs = { 'a.js': { originalContent: 'old', changeSetId: 'cs-1' } };
    await act(async () => {
      await handleUndo();
    });
    expect(setLocalContent).toHaveBeenCalledWith('old');
  });
});
