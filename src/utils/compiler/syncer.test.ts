import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncFilesToContainer } from './syncer';
import type { AlmostnodeContainer, FolderTreeNode, LocalFsLike } from './types';

type DirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

describe('syncFilesToContainer', () => {
  let mockContainer: AlmostnodeContainer;
  let onLogMock: Mock<(message: string) => void>;

  beforeEach(() => {
    mockContainer = {
      vfs: {
        writeFileSync: vi.fn(),
        existsSync: vi.fn().mockReturnValue(false),
        readFileSync: vi.fn(),
        readdirSync: vi.fn().mockReturnValue([]),
        mkdirSync: vi.fn(),
        unlinkSync: vi.fn(),
      },
      npm: { installFromPackageJson: vi.fn() },
      runtime: { runFileAsync: vi.fn() },
      run: vi.fn(),
    };
    onLogMock = vi.fn();
  });

  it('syncs files using fs.mode local', async () => {
    const mockFileEntry = {
      kind: 'file',
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue('file content'),
      }),
    } as unknown as FileSystemFileHandle;

    const mockDirEntry = {
      kind: 'directory',
      entries: async function* () {},
    } as unknown as FileSystemDirectoryHandle;

    const mockRootHandle = {
      entries: async function* () {
        yield ['src', mockDirEntry];
        yield ['test.js', mockFileEntry];
        yield ['node_modules', mockDirEntry];
      },
    } as unknown as DirectoryHandleWithEntries;

    const fs: LocalFsLike = {
      mode: 'local',
      rootHandle: mockRootHandle,
    };

    await syncFilesToContainer(mockContainer, fs, [], {}, onLogMock);

    expect(mockContainer.vfs.writeFileSync).toHaveBeenCalledWith('/test.js', 'file content');
    expect(onLogMock).toHaveBeenCalledWith('File synchronization complete.');
  });

  it('syncs files using folderTree when fs.mode is not local', async () => {
    const folderTree: FolderTreeNode[] = [
      {
        name: 'src',
        isDir: true,
        children: [
          {
            name: 'App.js',
            isDir: false,
            content: 'console.log("app");',
          },
        ],
      },
      {
        name: 'node_modules',
        type: 'folder',
        children: [],
      },
      {
        name: 'package.json',
        isDir: false,
        content: '{}',
      },
    ];

    const fs: LocalFsLike = {
      mode: 'opfs',
    };

    const fileContents = {
      'src/App.js': 'console.log("app in-memory");',
    };

    await syncFilesToContainer(mockContainer, fs, folderTree, fileContents, onLogMock);

    expect(mockContainer.vfs.writeFileSync).toHaveBeenCalledWith(
      '/src/App.js',
      'console.log("app in-memory");',
    );
    expect(mockContainer.vfs.writeFileSync).toHaveBeenCalledWith('/package.json', '{}');
  });

  it('handles file read errors gracefully during sync', async () => {
    const mockFileEntry = {
      kind: 'file',
      getFile: vi.fn().mockRejectedValue(new Error('File access denied')),
    } as unknown as FileSystemFileHandle;

    const mockRootHandle = {
      entries: async function* () {
        yield ['unreadable.js', mockFileEntry];
      },
    } as unknown as DirectoryHandleWithEntries;

    const fs: LocalFsLike = {
      mode: 'local',
      rootHandle: mockRootHandle,
    };

    await syncFilesToContainer(mockContainer, fs, [], {}, onLogMock);

    expect(mockContainer.vfs.writeFileSync).toHaveBeenCalledWith('/unreadable.js', '');
    expect(onLogMock).toHaveBeenCalledWith(
      'Warning: Failed to read unreadable.js: File access denied',
    );
  });

  it('yields execution on large folderTree counts', async () => {
    const folderTree: FolderTreeNode[] = [];
    for (let i = 0; i < 55; i++) {
      folderTree.push({
        name: `file_${i}.js`,
        isDir: false,
        content: 'content',
      });
    }

    const fs: LocalFsLike = {
      mode: 'opfs',
    };

    await syncFilesToContainer(mockContainer, fs, folderTree, {}, onLogMock);

    expect(mockContainer.vfs.writeFileSync).toHaveBeenCalledTimes(55);
  });

  it('yields execution on large local traverse counts', async () => {
    const mockFileEntry = {
      kind: 'file',
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue('local-data'),
      }),
    } as unknown as FileSystemFileHandle;

    const fs: LocalFsLike = {
      mode: 'local',
      rootHandle: {
        entries: async function* () {
          for (let i = 0; i < 25; i++) {
            yield [`file_${i}.js`, mockFileEntry];
          }
        },
      } as unknown as DirectoryHandleWithEntries,
    };

    await syncFilesToContainer(mockContainer, fs, [], {}, onLogMock);

    expect(mockContainer.vfs.writeFileSync).toHaveBeenCalledTimes(25);
  });

  it('removes files deleted from the project on a later sync', async () => {
    const fs: LocalFsLike = { mode: 'opfs' };
    await syncFilesToContainer(
      mockContainer,
      fs,
      [{ name: 'removed.js', isDir: false, content: 'first' }],
      {},
      onLogMock,
    );
    await syncFilesToContainer(mockContainer, fs, [], {}, onLogMock);

    expect(mockContainer.vfs.unlinkSync).toHaveBeenCalledWith('/removed.js');
    expect(onLogMock).toHaveBeenCalledWith(
      'Removed deleted file from virtual environment: /removed.js',
    );
  });
});
