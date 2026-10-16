import { describe, expect, it } from 'vitest';
import {
  clearDirtyBufferInDraft,
  commitDirtyBufferContentsInDraft,
  createEffectiveFileContentsLookup,
  createEffectiveFileContentsSnapshot,
  createEffectiveFileContentsView,
  readEffectiveFileContent,
  setDirtyBufferInDraft,
} from './EditorBuffers';

describe('EditorBuffers', () => {
  it('overlays dirty paths and materializes a fresh action snapshot', () => {
    const fileContents = { 'src/App.tsx': 'committed', 'src/empty.ts': 'old' };
    const state = {
      fileContents,
      dirtyBufferContents: { 'src/App.tsx': 'latest', 'src/empty.ts': '' },
    };

    expect(readEffectiveFileContent(state, 'src/App.tsx')).toBe('latest');
    expect(readEffectiveFileContent(state, 'src/empty.ts')).toBe('');
    expect(readEffectiveFileContent(state, 'missing.ts')).toBeUndefined();
    expect(createEffectiveFileContentsSnapshot(state)).toEqual({
      'src/App.tsx': 'latest',
      'src/empty.ts': '',
    });
    expect(createEffectiveFileContentsSnapshot(state)).not.toBe(fileContents);
    expect(fileContents).toEqual({ 'src/App.tsx': 'committed', 'src/empty.ts': 'old' });
  });

  it('provides a read-only effective view without copying the committed map', () => {
    const fileContents = { 'src/App.tsx': 'committed' };
    const view = createEffectiveFileContentsView({
      fileContents,
      dirtyBufferContents: { 'src/App.tsx': 'latest', 'src/New.tsx': 'new' },
    });

    expect(view).not.toBe(fileContents);
    expect(view['src/App.tsx']).toBe('latest');
    expect(view['src/New.tsx']).toBe('new');
    expect(Object.keys(view).sort()).toEqual(['src/App.tsx', 'src/New.tsx']);
    expect(Reflect.set(view, 'src/App.tsx', 'mutated')).toBe(false);
    expect(fileContents['src/App.tsx']).toBe('committed');
  });

  it('supports path lookups without enumerating the dirty overlay', () => {
    let enumerations = 0;
    const dirtyBufferContents = new Proxy(
      { 'src/App.tsx': 'latest' },
      {
        ownKeys(target) {
          enumerations += 1;
          return Reflect.ownKeys(target);
        },
      },
    );
    const lookup = createEffectiveFileContentsLookup({
      fileContents: { 'src/App.tsx': 'committed', 'src/App.module.css': '.root {}' },
      dirtyBufferContents,
    });

    expect(lookup['src/App.tsx']).toBe('latest');
    expect(lookup['src/App.module.css']).toBe('.root {}');
    expect(enumerations).toBe(0);
  });

  it('updates a typing buffer without replacing the committed workspace map', () => {
    const fileContents = { 'src/App.tsx': 'committed', 'package.json': '{}' };
    const draft = { fileContents, dirtyBufferContents: {} as Record<string, string> };

    setDirtyBufferInDraft(draft, 'src/App.tsx', 'typed');

    expect(draft.dirtyBufferContents).toEqual({ 'src/App.tsx': 'typed' });
    expect(draft.fileContents).toBe(fileContents);
  });

  it('commits only dirty paths that still match the saved snapshot', () => {
    const originalContents = { 'src/App.tsx': 'old' };
    const draft = {
      fileContents: originalContents,
      dirtyBufferContents: {
        'src/App.tsx': 'saved value',
        'src/Concurrent.tsx': 'newer value',
      },
    };
    setDirtyBufferInDraft(draft, 'src/Third.tsx', 'third');
    commitDirtyBufferContentsInDraft(draft, {
      'src/App.tsx': 'saved value',
      'src/Concurrent.tsx': 'snapshot value',
    });

    expect(draft.fileContents).toEqual({ 'src/App.tsx': 'saved value' });
    expect(draft.fileContents).not.toBe(originalContents);
    expect(draft.dirtyBufferContents).toEqual({
      'src/Concurrent.tsx': 'newer value',
      'src/Third.tsx': 'third',
    });

    clearDirtyBufferInDraft(draft, 'src/Third.tsx');
    expect(draft.dirtyBufferContents).toEqual({ 'src/Concurrent.tsx': 'newer value' });
  });
});
