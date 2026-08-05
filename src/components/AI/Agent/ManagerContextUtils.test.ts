import { describe, expect, it } from 'vitest';
import type { ModelResult } from '../types';
import { normalizeModelChanges } from './ManagerContextUtils';

describe('normalizeModelChanges', () => {
  it('materializes SEARCH/REPLACE patches even in compatibility mode', () => {
    const result: ModelResult = {
      kind: 'changes',
      summary: 'Update the title.',
      changes: [{ path: 'src/App.jsx', search: 'Old', replace: 'New' }],
    };

    expect(normalizeModelChanges(result, { 'src/App.jsx': '<h1>Old</h1>' })).toEqual([
      {
        path: 'src/App.jsx',
        before: '<h1>Old</h1>',
        after: '<h1>New</h1>',
        search: 'Old',
        replace: 'New',
      },
    ]);
  });

  it('rejects complete replacement content for existing files when patches are required', () => {
    const result: ModelResult = {
      kind: 'changes',
      summary: 'Rewrite the file.',
      changes: [{ path: 'src/App.jsx', content: 'new content' }],
    };

    expect(() =>
      normalizeModelChanges(result, { 'src/App.jsx': 'old content' }, { requirePatches: true }),
    ).toThrow(/exact search\/replace patch/);
  });

  it('always applies a patch against the current workspace content', () => {
    const result: ModelResult = {
      kind: 'changes',
      summary: 'Update the title.',
      changes: [
        {
          path: 'src/App.jsx',
          before: '<h1>Stale</h1>',
          search: 'Old',
          replace: 'New',
        },
      ],
    };

    expect(normalizeModelChanges(result, { 'src/App.jsx': '<h1>Old</h1>' })[0]).toMatchObject({
      before: '<h1>Old</h1>',
      after: '<h1>New</h1>',
    });
  });
});
