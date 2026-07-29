vi.mock('@/components/Storage', () => ({ useFileSystem: vi.fn() }));
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { useFileSystem } from '@/components/Storage';
import { asMockUseFileSystem } from '@/test-utils/fsMocks';
import { makeEditorState, makeTabState } from '@/test-utils/stateMocks';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTabRestorer } from './TabRestorer';

vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/App/Panes/TabBar', () => ({
  TabState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/Storage/Settings', () => ({
  default: {
    getOpenTabs: vi.fn(),
    getActiveTabId: vi.fn(),
  },
}));

describe('useTabRestorer', () => {
  let editorState: ReturnType<typeof makeEditorState>;
  let tabState: ReturnType<typeof makeTabState>;
  let mockFs: ReturnType<typeof useFileSystem>;

  beforeEach(() => {
    vi.clearAllMocks();

    editorState = makeEditorState({ fileContents: {} });
    tabState = makeTabState({ openTabs: [], activeTabId: null });
    vi.mocked(EditorState.useState).mockReturnValue(
      editorState as ReturnType<typeof EditorState.useState>,
    );
    vi.mocked(TabState.useState).mockReturnValue(tabState);

    mockFs = asMockUseFileSystem({
      rootHandle: { name: 'root' } as FileSystemDirectoryHandle,
      getFileHandleAtPath: vi.fn(),
      readFile: vi.fn(),
    });
    vi.mocked(useFileSystem).mockReturnValue(mockFs);
  });

  it('restores all tabs when they are all found in the file system', async () => {
    tabState.openTabs = [
      { id: 'file1.js', label: 'file1.js', type: 'file' },
      { id: 'file2.js', label: 'file2.js', type: 'file' },
    ];
    tabState.activeTabId = 'file1.js';

    vi.mocked(mockFs.getFileHandleAtPath).mockImplementation(
      async (path: string) =>
        ({
          kind: 'file',
          name: path,
        }) as unknown as FileSystemFileHandle,
    );
    vi.mocked(mockFs.readFile).mockResolvedValue('file content');

    await act(async () => {
      renderHook(() => useTabRestorer());
      await Promise.resolve();
    });

    expect(tabState.openTabs).toHaveLength(2);
    expect(tabState.activeTabId).toBe('file1.js');
    expect(editorState.fileContents['file1.js']).toBe('file content');
    expect(editorState.fileContents['file2.js']).toBe('file content');
  });

  it('falls back to the last successfully restored tab if the active tab fails to restore', async () => {
    tabState.openTabs = [
      { id: 'file1.js', label: 'file1.js', type: 'file' },
      { id: 'file2.js', label: 'file2.js', type: 'file' },
    ];
    tabState.activeTabId = 'file1.js';

    vi.mocked(mockFs.getFileHandleAtPath).mockImplementation(async (path: string) => {
      if (path === 'file2.js') {
        return { kind: 'file', name: 'file2.js' } as unknown as FileSystemFileHandle;
      }
      return null;
    });
    vi.mocked(mockFs.readFile).mockImplementation(async (handle) => {
      if ((handle as FileSystemFileHandle).name === 'file2.js') return 'content2';
      return '';
    });

    await act(async () => {
      renderHook(() => useTabRestorer());
      await Promise.resolve();
    });

    expect(tabState.openTabs).toHaveLength(1);
    expect(tabState.openTabs[0]!.id).toBe('file2.js');
    expect(tabState.activeTabId).toBe('file2.js');
    expect(editorState.fileContents['file2.js']).toBe('content2');
  });

  it('sets openTabs to empty and activeTabId to null if all tabs fail to restore', async () => {
    tabState.openTabs = [
      { id: 'file1.js', label: 'file1.js', type: 'file' },
      { id: 'file2.js', label: 'file2.js', type: 'file' },
    ];
    tabState.activeTabId = 'file1.js';

    vi.mocked(mockFs.getFileHandleAtPath).mockResolvedValue(null);

    await act(async () => {
      renderHook(() => useTabRestorer());
      await Promise.resolve();
    });

    expect(tabState.openTabs).toHaveLength(0);
    expect(tabState.activeTabId).toBeNull();
  });
});
