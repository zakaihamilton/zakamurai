import { describe, expect, it, vi, beforeEach } from 'vitest';
import { syncFilesToContainer } from './syncer';

describe('syncFilesToContainer', () => {
  let mockContainer;
  let onLogMock;

  beforeEach(() => {
    mockContainer = {
      vfs: {
        writeFileSync: vi.fn(),
        existsSync: vi.fn().mockReturnValue(false),
        mkdirSync: vi.fn(),
      },
    };
    onLogMock = vi.fn();
  });

  it('syncs files using fs.mode local', async () => {
    const mockFileEntry = {
      kind: 'file',
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue('file content'),
      }),
    };

    const mockDirEntry = {
      kind: 'directory',
      entries: async function* () {},
    };

    const mockRootHandle = {
      entries: async function* () {
        yield ['src', mockDirEntry];
        yield ['test.js', mockFileEntry];
        yield ['node_modules', mockDirEntry];
      },
    };

    const fs = {
      mode: 'local',
      rootHandle: mockRootHandle,
    };

    await syncFilesToContainer(mockContainer, fs, [], {}, onLogMock);

    expect(mockContainer.vfs.writeFileSync).toHaveBeenCalledWith('/test.js', 'file content');
    expect(onLogMock).toHaveBeenCalledWith('File synchronization complete.');
  });

  it('syncs files using folderTree when fs.mode is not local', async () => {
    const folderTree = [
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

    const fs = {
      mode: 'opfs',
    };

    const fileContents = {
      'src/App.js': 'console.log("app in-memory");',
    };

    await syncFilesToContainer(mockContainer, fs, folderTree, fileContents, onLogMock);

    expect(mockContainer.vfs.writeFileSync).toHaveBeenCalledWith(
      '/src/App.js',
      'console.log("app in-memory");'
    );
    expect(mockContainer.vfs.writeFileSync).toHaveBeenCalledWith(
      '/package.json',
      '{}'
    );
  });

  it('handles file read errors gracefully during sync', async () => {
    const mockFileEntry = {
      kind: 'file',
      getFile: vi.fn().mockRejectedValue(new Error('File access denied')),
    };

    const mockRootHandle = {
      entries: async function* () {
        yield ['unreadable.js', mockFileEntry];
      },
    };

    const fs = {
      mode: 'local',
      rootHandle: mockRootHandle,
    };

    await syncFilesToContainer(mockContainer, fs, [], {}, onLogMock);

    expect(mockContainer.vfs.writeFileSync).toHaveBeenCalledWith('/unreadable.js', '');
    expect(onLogMock).toHaveBeenCalledWith('Warning: Failed to read unreadable.js: File access denied');
  });

  it('yields execution on large folderTree counts', async () => {
    const folderTree = [];
    for (let i = 0; i < 55; i++) {
      folderTree.push({
        name: `file_${i}.js`,
        isDir: false,
        content: 'content',
      });
    }

    const fs = {
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
    };

    const fs = {
      mode: 'local',
      rootHandle: {
        entries: async function* () {
          for (let i = 0; i < 25; i++) {
            yield [`file_${i}.js`, mockFileEntry];
          }
        },
      },
    };

    await syncFilesToContainer(mockContainer, fs, [], {}, onLogMock);

    expect(mockContainer.vfs.writeFileSync).toHaveBeenCalledTimes(25);
  });
});
