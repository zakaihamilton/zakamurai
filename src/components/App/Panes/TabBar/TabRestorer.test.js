import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import Settings from '@/components/Storage/Settings';
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
  let mockEditorState;
  let editorStateHook;
  let mockTabState;
  let tabStateHook;
  let mockFs;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEditorState = {
      fileContents: {},
    };
    editorStateHook = vi.fn((producer) => {
      if (typeof producer === 'function') {
        const draft = { ...mockEditorState };
        producer(draft);
        mockEditorState = draft;
      }
      return editorStateHook;
    });
    Object.defineProperty(editorStateHook, 'fileContents', {
      get: () => mockEditorState.fileContents,
      set: (val) => {
        mockEditorState.fileContents = val;
      },
      configurable: true,
    });
    vi.spyOn(EditorState, 'useState').mockReturnValue(editorStateHook);

    mockTabState = {
      openTabs: [],
      activeTabId: null,
    };
    tabStateHook = vi.fn((producer) => {
      if (typeof producer === 'function') {
        const draft = { ...mockTabState };
        producer(draft);
        mockTabState = draft;
      }
      return tabStateHook;
    });
    Object.defineProperty(tabStateHook, 'openTabs', {
      get: () => mockTabState.openTabs,
      set: (val) => {
        mockTabState.openTabs = val;
      },
      configurable: true,
    });
    Object.defineProperty(tabStateHook, 'activeTabId', {
      get: () => mockTabState.activeTabId,
      set: (val) => {
        mockTabState.activeTabId = val;
      },
      configurable: true,
    });
    vi.spyOn(TabState, 'useState').mockReturnValue(tabStateHook);

    mockFs = {
      rootHandle: { name: 'root' },
      getFileHandleAtPath: vi.fn(),
      readFile: vi.fn(),
    };
    vi.spyOn(AppState, 'useState').mockReturnValue({ fs: mockFs });
  });

  it('restores all tabs when they are all found in the file system', async () => {
    mockTabState.openTabs = [
      { id: 'file1.js', label: 'file1.js', type: 'file' },
      { id: 'file2.js', label: 'file2.js', type: 'file' },
    ];
    mockTabState.activeTabId = 'file1.js';

    mockFs.getFileHandleAtPath.mockImplementation(async (path) => ({ kind: 'file', name: path }));
    mockFs.readFile.mockResolvedValue('file content');

    await act(async () => {
      renderHook(() => useTabRestorer());
    });

    expect(mockTabState.openTabs).toHaveLength(2);
    expect(mockTabState.activeTabId).toBe('file1.js');
    expect(mockEditorState.fileContents['file1.js']).toBe('file content');
    expect(mockEditorState.fileContents['file2.js']).toBe('file content');
  });

  it('falls back to the last successfully restored tab if the active tab fails to restore', async () => {
    mockTabState.openTabs = [
      { id: 'file1.js', label: 'file1.js', type: 'file' },
      { id: 'file2.js', label: 'file2.js', type: 'file' },
    ];
    mockTabState.activeTabId = 'file1.js'; // active tab fails to restore

    mockFs.getFileHandleAtPath.mockImplementation(async (path) => {
      if (path === 'file2.js') return { kind: 'file', name: path };
      return null; // file1.js fails to restore
    });
    mockFs.readFile.mockImplementation(async (handle) => {
      if (handle.name === 'file2.js') return 'content2';
      return null;
    });

    await act(async () => {
      renderHook(() => useTabRestorer());
    });

    expect(mockTabState.openTabs).toHaveLength(1);
    expect(mockTabState.openTabs[0].id).toBe('file2.js');
    // activeTabId should fall back to the restored tab
    expect(mockTabState.activeTabId).toBe('file2.js');
    expect(mockEditorState.fileContents['file2.js']).toBe('content2');
  });

  it('sets openTabs to empty and activeTabId to null if all tabs fail to restore', async () => {
    mockTabState.openTabs = [
      { id: 'file1.js', label: 'file1.js', type: 'file' },
      { id: 'file2.js', label: 'file2.js', type: 'file' },
    ];
    mockTabState.activeTabId = 'file1.js';

    mockFs.getFileHandleAtPath.mockResolvedValue(null); // All fail

    await act(async () => {
      renderHook(() => useTabRestorer());
    });

    expect(mockTabState.openTabs).toHaveLength(0);
    expect(mockTabState.activeTabId).toBeNull();
  });
});
