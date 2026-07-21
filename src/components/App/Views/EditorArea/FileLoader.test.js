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
    const setLocalContent = vi.fn();
    const state = { fileContents: { 'a.js': 'from-state' } };

    renderHook(() =>
      useFileLoader({
        filePath: 'a.js',
        localContent: 'local',
        setLocalContent,
        fallbackContent: '',
        fs: { mode: 'memory' },
        fsHandle: null,
        state,
      }),
    );

    expect(setLocalContent).toHaveBeenCalledWith('from-state');
  });

  it('loads content from the filesystem once per file path', async () => {
    const setLocalContent = vi.fn((updater) =>
      typeof updater === 'function' ? updater('starting') : updater,
    );
    const state = Object.assign(
      vi.fn((updater) => {
        const draft = { fileContents: { ...(state.fileContents || {}) } };
        updater(draft);
        state.fileContents = draft.fileContents;
      }),
      { fileContents: {} },
    );
    const handle = { name: 'a.js' };
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
          fsHandle: null,
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
    const state = Object.assign(
      vi.fn((updater) => {
        const draft = { fileContents: { ...(state.fileContents || {}) } };
        updater(draft);
        state.fileContents = draft.fileContents;
      }),
      { fileContents: {} },
    );
    const importedHandle = { name: 'util.js' };
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
          setLocalContent: vi.fn(),
          fallbackContent: '',
          fs,
          fsHandle: null,
          state,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(state.fileContents['src/util.js']).toBe('import content');
  });
});
