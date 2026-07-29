import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWorkspaceIndex, useWorkspaceIndexer } from './WorkspaceIndexer';

vi.mock('@/components/Storage', () => ({
  useFileSystem: vi.fn().mockReturnValue({
    isReady: true,
    version: 1,
    mode: 'sandbox',
    rootHandle: null,
  }),
}));

vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: {
    useState: vi.fn().mockReturnValue({
      fileContents: { 'src/index.js': 'console.log("hello");' },
    }),
  },
}));

vi.mock('./WorkspaceState', () => ({
  WorkspaceProfileState: {
    useState: vi.fn().mockReturnValue({ include: [], exclude: [], maxFileBytes: 512 * 1024 }),
  },
  WorkspaceHealthState: {
    useState: vi.fn().mockReturnValue(vi.fn()),
  },
}));

describe('WorkspaceIndexer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns global workspaceIndex instance', () => {
    const index = getWorkspaceIndex();
    expect(index).toBeDefined();
    expect(typeof index.queryText).toBe('function');
  });

  it('runs useWorkspaceIndexer hook without error', () => {
    const { unmount } = renderHook(() => useWorkspaceIndexer());
    vi.advanceTimersByTime(1000);
    unmount();
  });
});
