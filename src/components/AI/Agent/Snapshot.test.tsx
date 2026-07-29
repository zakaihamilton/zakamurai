import type { FileSystemLike } from '@/components/AI/types';
import { describe, expect, it } from 'vitest';
import { collectWorkspaceFiles } from './Snapshot';

describe('collectWorkspaceFiles', () => {
  it('returns knownFiles if fs mode is not local or rootHandle is missing', async () => {
    const knownFiles = { 'existing.js': 'content' };
    const res1 = await collectWorkspaceFiles(null, knownFiles);
    expect(res1).toEqual(knownFiles);

    const res2 = await collectWorkspaceFiles({ mode: 'opfs' }, knownFiles);
    expect(res2).toEqual(knownFiles);

    const res3 = await collectWorkspaceFiles({ mode: 'local' }, knownFiles);
    expect(res3).toEqual(knownFiles);
  });

  it('recursively walks directory and collects file contents', async () => {
    const mockFile1 = {
      size: 1000,
      text: async () => 'file1 content',
    };
    const mockFile2 = {
      size: 2000,
      text: async () => 'file2 content',
    };

    const mockRootHandle = {
      entries: async function* () {
        yield [
          'src',
          {
            kind: 'directory',
            entries: async function* () {
              yield [
                'file1.js',
                {
                  kind: 'file',
                  getFile: async () => mockFile1,
                },
              ];
            },
          },
        ];
        yield [
          'file2.js',
          {
            kind: 'file',
            getFile: async () => mockFile2,
          },
        ];
        yield [
          'node_modules',
          {
            kind: 'directory',
          },
        ];
      },
    };

    const fs = {
      mode: 'local',
      rootHandle: mockRootHandle,
    };

    const files = await collectWorkspaceFiles(fs as unknown as FileSystemLike);
    expect(files).toEqual({
      'src/file1.js': 'file1 content',
      'file2.js': 'file2 content',
    });
  });

  it('skips files larger than 500,000 bytes', async () => {
    const mockLargeFile = {
      size: 600000,
      text: async () => 'large file content',
    };

    const mockRootHandle = {
      entries: async function* () {
        yield [
          'large.js',
          {
            kind: 'file',
            getFile: async () => mockLargeFile,
          },
        ];
      },
    };

    const fs = {
      mode: 'local',
      rootHandle: mockRootHandle,
    };

    const files = await collectWorkspaceFiles(fs as unknown as FileSystemLike);
    expect(files).toEqual({});
  });

  it('stops recursion if depth exceeds 20', async () => {
    const createDeepHandle = (currentDepth: number, maxDepth: number) => {
      return {
        kind: 'directory',
        entries: async function* () {
          if (currentDepth < maxDepth) {
            yield [`dir${currentDepth}`, createDeepHandle(currentDepth + 1, maxDepth)];
          } else {
            yield [
              'file.js',
              {
                kind: 'file',
                getFile: async () => ({
                  size: 100,
                  text: async () => 'deep content',
                }),
              },
            ];
          }
        },
      };
    };

    // Depth 21 (exceeds 20 limit)
    const fs = {
      mode: 'local',
      rootHandle: createDeepHandle(0, 21),
    };

    const files = await collectWorkspaceFiles(fs as unknown as FileSystemLike);
    expect(files).toEqual({});
  });
});
