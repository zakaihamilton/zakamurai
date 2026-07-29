import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { useFileSystem } from '@/components/Storage';
import { Compiler } from '@/utils/compiler';
import { createMockEditorState } from '@/test-utils/editorMocks';
import { asMockUseFileSystem } from '@/test-utils/fsMocks';
import { makeTreeNode } from '@/test-utils/treeMocks';
import { makeAppState, makeSidebarState } from '@/test-utils/stateMocks';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useZipExporter from './ZipExporter';

vi.mock('@/components/Storage', () => ({
  useFileSystem: vi.fn(),
}));
vi.mock('@/components/App/AppState', () => ({
  AppState: { useState: vi.fn(() => makeAppState({ projectName: 'Test Project' })) },
}));
vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: { usePassiveState: vi.fn() },
}));
vi.mock('@/components/App/Panes/Sidebar', () => ({
  SidebarState: { useState: vi.fn(() => makeSidebarState()) },
}));
vi.mock('@/utils/compiler', () => ({
  Compiler: {
    getContainer: vi.fn(),
  },
}));

describe('useZipExporter', () => {
  const mockFolderTree = [
    makeTreeNode('App.js', 'file'),
    makeTreeNode('components', 'folder', [makeTreeNode('Button.js', 'file')]),
  ];

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:test-url');
    URL.revokeObjectURL = vi.fn();
    vi.mocked(useFileSystem).mockReturnValue(asMockUseFileSystem({ mode: 'sandbox' }));
    vi.mocked(EditorState.usePassiveState).mockReturnValue(
      createMockEditorState({ fileContents: { 'App.js': 'console.log("hello");' } }) as ReturnType<
        typeof EditorState.usePassiveState
      >,
    );
    vi.mocked(SidebarState.useState).mockReturnValue(
      makeSidebarState({ folderTree: mockFolderTree }),
    );
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ projectName: 'Test Project' }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const originalAppend = Node.prototype.appendChild;
    vi.spyOn(document.body, 'appendChild').mockImplementation((el) => {
      if (el instanceof HTMLAnchorElement && el.download) return el;
      return originalAppend.call(document.body, el);
    });

    const originalRemove = Node.prototype.removeChild;
    vi.spyOn(document.body, 'removeChild').mockImplementation((el) => {
      if (el instanceof HTMLAnchorElement && el.download) return el;
      return originalRemove.call(document.body, el);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handleExportZip exports zip correctly in sandbox mode', async () => {
    const { result } = renderHook(() => useZipExporter());

    await act(async () => {
      await result.current.handleExportZip();
    });

    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('reports and clears an error if compiled files are unavailable', async () => {
    vi.mocked(Compiler.getContainer).mockReturnValue(null);

    const { result } = renderHook(() => useZipExporter());

    await act(async () => {
      await result.current.handleExportCompiledZip();
    });

    expect(result.current.exportError).toBe(
      'No compiled files found. Please compile the project first.',
    );

    act(() => {
      result.current.clearExportError();
    });
    expect(result.current.exportError).toBeNull();
  });

  it('handleExportCompiledZip processes and exports files correctly', async () => {
    const mockVfs = {
      readdirSync: vi.fn().mockImplementation((path: string) => {
        if (path === '/') return ['App.jsx', 'styles.module.css'];
        throw new Error('Not a directory');
      }),
      readFileSync: vi.fn().mockReturnValue('content'),
    };
    vi.mocked(Compiler.getContainer).mockReturnValue({ vfs: mockVfs } as never);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: {
        get: () => 'application/javascript',
      },
      text: async () => 'import "./styles.module.css"; console.log("JSX");',
    } as unknown as Response);

    const { result } = renderHook(() => useZipExporter());

    await act(async () => {
      await result.current.handleExportCompiledZip();
    });

    expect(fetchSpy).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('handleExportZip exports zip correctly in local mode', async () => {
    const mockFileEntry = {
      kind: 'file',
      getFile: vi.fn().mockResolvedValue({
        arrayBuffer: async () => new ArrayBuffer(8),
      }),
    };
    const mockDirEntry = {
      kind: 'directory',
      entries: async function* () {
        yield ['Button.js', mockFileEntry];
      },
    };
    vi.mocked(useFileSystem).mockReturnValue(
      asMockUseFileSystem({
        mode: 'local',
        rootHandle: {
          entries: async function* () {
            yield ['App.js', mockFileEntry];
            yield ['components', mockDirEntry];
          },
        } as unknown as FileSystemDirectoryHandle,
      }),
    );

    const { result } = renderHook(() => useZipExporter());

    await act(async () => {
      await result.current.handleExportZip();
    });

    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('handleExportCompiledZip handles fetch failures and falls back to VFS reading', async () => {
    const mockVfs = {
      readdirSync: vi.fn().mockImplementation((path: string) => {
        if (path === '/') return ['App.jsx'];
        throw new Error('Not a directory');
      }),
      readFileSync: vi.fn().mockReturnValue('vfs-file-content'),
    };
    vi.mocked(Compiler.getContainer).mockReturnValue({ vfs: mockVfs } as never);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useZipExporter());

    await act(async () => {
      await result.current.handleExportCompiledZip();
    });

    expect(mockVfs.readFileSync).toHaveBeenCalledWith('/App.jsx');
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('reads local files from disk when they are not in editor memory', async () => {
    const diskContent = new Uint8Array([1, 2, 3]);
    const mockFileEntry = {
      kind: 'file',
      getFile: vi.fn().mockResolvedValue({
        arrayBuffer: async () => diskContent.buffer,
      }),
    };
    vi.mocked(useFileSystem).mockReturnValue(
      asMockUseFileSystem({
        mode: 'local',
        rootHandle: {
          entries: async function* () {
            yield ['disk.js', mockFileEntry];
          },
        } as unknown as FileSystemDirectoryHandle,
      }),
    );
    vi.mocked(EditorState.usePassiveState).mockReturnValue(
      createMockEditorState({ fileContents: {} }) as ReturnType<typeof EditorState.usePassiveState>,
    );

    const { result } = renderHook(() => useZipExporter());

    await act(async () => {
      await result.current.handleExportZip();
    });

    expect(mockFileEntry.getFile).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('exports non-text compiled assets as binary blobs', async () => {
    const mockVfs = {
      readdirSync: vi.fn().mockImplementation((path: string) => {
        if (path === '/') return ['logo.png'];
        throw new Error('Not a directory');
      }),
      readFileSync: vi.fn(),
    };
    vi.mocked(Compiler.getContainer).mockReturnValue({ vfs: mockVfs } as never);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer,
    } as unknown as Response);

    const { result } = renderHook(() => useZipExporter());

    await act(async () => {
      await result.current.handleExportCompiledZip();
    });

    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});
