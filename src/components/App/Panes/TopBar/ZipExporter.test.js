import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { useFileSystem } from '@/components/Storage';
import { Compiler } from '@/utils/compiler';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useZipExporter from './ZipExporter';

vi.mock('@/components/Storage', () => ({
  useFileSystem: vi.fn(),
}));
vi.mock('@/components/App/AppState', () => ({
  AppState: { useState: vi.fn(() => ({ projectName: 'Test Project' })) },
}));
vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: { usePassiveState: vi.fn() },
}));
vi.mock('@/components/App/Panes/Sidebar', () => ({
  SidebarState: { useState: vi.fn(() => ({ folderTree: [] })) },
}));
vi.mock('@/utils/compiler', () => ({
  Compiler: {
    getContainer: vi.fn(),
  },
}));

describe('useZipExporter', () => {
  let mockFs;
  let mockEditorState;
  let mockFolderTree;
  let projectName;
  let originalCreateObjectURL;
  let originalRevokeObjectURL;

  beforeEach(() => {
    mockFs = { mode: 'sandbox' };
    mockEditorState = { fileContents: { 'App.js': 'console.log("hello");' } };
    mockFolderTree = [
      { name: 'App.js', type: 'file' },
      {
        name: 'components',
        type: 'folder',
        children: [{ name: 'Button.js', type: 'file' }],
      },
    ];
    projectName = 'Test Project';

    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:test-url');
    URL.revokeObjectURL = vi.fn();
    useFileSystem.mockReturnValue(mockFs);
    EditorState.usePassiveState.mockReturnValue(mockEditorState);
    SidebarState.useState.mockReturnValue({ folderTree: mockFolderTree });
    AppState.useState.mockReturnValue({ projectName });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const originalAppend = Node.prototype.appendChild;
    vi.spyOn(document.body, 'appendChild').mockImplementation((el) => {
      if (el.tagName === 'A' && el.download) return el;
      return originalAppend.call(document.body, el);
    });

    const originalRemove = Node.prototype.removeChild;
    vi.spyOn(document.body, 'removeChild').mockImplementation((el) => {
      if (el.tagName === 'A' && el.download) return el;
      return originalRemove.call(document.body, el);
    });
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('handleExportZip exports zip correctly in sandbox mode', async () => {
    const { result } = renderHook(() =>
      useZipExporter(mockFs, mockEditorState, mockFolderTree, projectName),
    );

    await act(async () => {
      await result.current.handleExportZip();
    });

    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('reports and clears an error if compiled files are unavailable', async () => {
    Compiler.getContainer.mockReturnValue(null);

    const { result } = renderHook(() =>
      useZipExporter(mockFs, mockEditorState, mockFolderTree, projectName),
    );

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
      readdirSync: vi.fn().mockImplementation((path) => {
        if (path === '/') return ['App.jsx', 'styles.module.css'];
        throw new Error('Not a directory');
      }),
      readFileSync: vi.fn().mockReturnValue('content'),
    };
    Compiler.getContainer.mockReturnValue({ vfs: mockVfs });

    // Mock global fetch to return 200 OK
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: {
        get: () => 'application/javascript',
      },
      text: async () => 'import "./styles.module.css"; console.log("JSX");',
    });

    const { result } = renderHook(() =>
      useZipExporter(mockFs, mockEditorState, mockFolderTree, projectName),
    );

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
    const localFs = {
      mode: 'local',
      rootHandle: {
        entries: async function* () {
          yield ['App.js', mockFileEntry];
          yield ['components', mockDirEntry];
        },
      },
    };

    const { result } = renderHook(() =>
      useZipExporter(localFs, mockEditorState, mockFolderTree, projectName),
    );

    await act(async () => {
      await result.current.handleExportZip();
    });

    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('handleExportCompiledZip handles fetch failures and falls back to VFS reading', async () => {
    const mockVfs = {
      readdirSync: vi.fn().mockImplementation((path) => {
        if (path === '/') return ['App.jsx'];
        throw new Error('Not a directory');
      }),
      readFileSync: vi.fn().mockReturnValue('vfs-file-content'),
    };
    Compiler.getContainer.mockReturnValue({ vfs: mockVfs });

    // Mock fetch to reject
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() =>
      useZipExporter(mockFs, mockEditorState, mockFolderTree, projectName),
    );

    await act(async () => {
      await result.current.handleExportCompiledZip();
    });

    expect(mockVfs.readFileSync).toHaveBeenCalledWith('/App.jsx');
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});
