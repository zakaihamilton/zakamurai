import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import useZipExporter from './ZipExporter';
import { Compiler } from '@/utils/compiler';

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
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    
    const originalAppend = Node.prototype.appendChild;
    vi.spyOn(document.body, 'appendChild').mockImplementation(function(el) {
      if (el.tagName === 'A' && el.download) return el;
      return originalAppend.call(document.body, el);
    });
    
    const originalRemove = Node.prototype.removeChild;
    vi.spyOn(document.body, 'removeChild').mockImplementation(function(el) {
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

  it('handleExportCompiledZip alerts if container not found', async () => {
    Compiler.getContainer.mockReturnValue(null);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useZipExporter(mockFs, mockEditorState, mockFolderTree, projectName),
    );

    await act(async () => {
      await result.current.handleExportCompiledZip();
    });

    expect(alertSpy).toHaveBeenCalledWith('No compiled files found. Please compile the project first.');
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
