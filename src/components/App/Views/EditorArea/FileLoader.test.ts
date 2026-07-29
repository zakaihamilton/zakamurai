import {
  createMockEditorState,
  createMockHighlightState,
  createMockPendingDiff,
  createMockScrollContainerRef,
  createSetLocalContentMock,
} from '@/test-utils/editorMocks';
import { makeFileHandle } from '@/test-utils/fsMocks';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useFileLoader from './FileLoader';

vi.mock('@/utils/navigation', () => ({
  getImportRanges: vi.fn(() => [{ path: './util' }]),
  getImportPathCandidates: vi.fn((path) => [`${path}.js`]),
  resolveRelativePath: vi.fn(() => 'src/util'),
}));

describe('useFileLoader', () => {
  it('syncs external file contents into local content', () => {
    const setLocalContent = createSetLocalContentMock();
    const state = createMockEditorState({ fileContents: { 'a.js': 'from-state' } });

    renderHook(() =>
      useFileLoader({
        filePath: 'a.js',
        localContent: 'local',
        setLocalContent,
        fallbackContent: '',
        fs: { mode: 'memory' },
        state,
      }),
    );

    expect(setLocalContent).toHaveBeenCalledWith('from-state');
  });

  it('loads content from the filesystem once per file path', async () => {
    const setLocalContent = vi.fn((updater: string | ((prev: string) => string)) => {
      if (typeof updater === 'function') updater('starting');
    }) as ReturnType<typeof createSetLocalContentMock>;
    const state = createMockEditorState({ fileContents: {} });
    const handle = makeFileHandle('a.js');
    const fs = {
      mode: 'local',
      readFile: vi.fn().mockResolvedValue('disk-content'),
      getFileHandleAtPath: vi.fn().mockResolvedValue(handle),
    };

    await act(async () => {
      renderHook(() =>
        useFileLoader({
          filePath: 'a.js',
          localContent: 'starting',
          setLocalContent,
          fallbackContent: '',
          fs,
          state,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fs.readFile).toHaveBeenCalledWith(handle);
    expect(setLocalContent).toHaveBeenCalled();
    expect(state.fileContents['a.js']).toBe('disk-content');
  });

  it('preloads imported files for navigation', async () => {
    const state = createMockEditorState({ fileContents: {} });
    const importedHandle = makeFileHandle('util.js');
    const fs = {
      mode: 'local',
      readFile: vi.fn().mockResolvedValue('import content'),
      getFileHandleAtPath: vi.fn().mockResolvedValue(importedHandle),
    };

    await act(async () => {
      renderHook(() =>
        useFileLoader({
          filePath: 'src/a.js',
          localContent: "import x from './util';",
          setLocalContent: createSetLocalContentMock(),
          fallbackContent: '',
          fs,
          state,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(state.fileContents['src/util.js']).toBe('import content');
  });
});
