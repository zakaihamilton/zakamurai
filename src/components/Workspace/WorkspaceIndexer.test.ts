import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWorkspaceIndex, useWorkspaceIndexer } from './WorkspaceIndexer';

const { collectWorkspaceFiles, workspaceController } = vi.hoisted(() => ({
  collectWorkspaceFiles: vi.fn(),
  workspaceController: {
    applyFileChanges: vi.fn(),
    dispose: vi.fn(),
    getHealth: vi.fn(),
    queryText: vi.fn(),
  },
}));

vi.mock('@/components/AI/Agent/Snapshot', () => ({
  collectWorkspaceFiles: (...args: unknown[]) => collectWorkspaceFiles(...args),
}));

vi.mock('@/components/Storage', () => ({
  useFileSystem: vi.fn(),
}));

vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: {
    useState: vi.fn(),
  },
}));

vi.mock('./WorkspaceState', () => ({
  WorkspaceProfileState: {
    useState: vi.fn(),
  },
  WorkspaceHealthState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/utils/workspace/index-controller', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/workspace/index-controller')>();
  return {
    ...actual,
    WorkspaceIndexController: vi.fn(() => workspaceController),
  };
});

import { EditorState } from '@/components/App/Views/EditorArea';
import { useFileSystem } from '@/components/Storage';
import { WorkspaceHealthState, WorkspaceProfileState } from './WorkspaceState';

const mockUseFileSystem = vi.mocked(useFileSystem);
const mockEditorState = vi.mocked(EditorState.useState);
const mockProfileState = vi.mocked(WorkspaceProfileState.useState);
const mockHealthState = vi.mocked(WorkspaceHealthState.useState);

describe('WorkspaceIndexer', () => {
  let health: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    health = vi.fn();
    mockUseFileSystem.mockReturnValue({
      isReady: true,
      version: 1,
      mode: 'sandbox',
      rootHandle: null,
    } as never);
    mockEditorState.mockReturnValue({
      fileContents: { 'src/index.js': 'console.log("hello");' },
    } as never);
    mockProfileState.mockReturnValue({
      include: [],
      exclude: [],
      maxFileBytes: 512 * 1024,
    } as never);
    mockHealthState.mockReturnValue(health as never);
    collectWorkspaceFiles.mockResolvedValue({
      'src/index.js': 'console.log("hello");',
    });
    workspaceController.applyFileChanges.mockResolvedValue(undefined);
    workspaceController.getHealth.mockResolvedValue({
      totalFiles: 1,
      indexedBytes: 21,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const flushIndex = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  };

  it('returns global workspaceIndex instance', () => {
    const index = getWorkspaceIndex();
    expect(index).toBeDefined();
    expect(typeof index.queryText).toBe('function');
  });

  it('indexes the initial workspace and disposes on unmount', async () => {
    const { unmount } = renderHook(() => useWorkspaceIndexer());
    await flushIndex();
    unmount();

    expect(collectWorkspaceFiles).toHaveBeenCalledOnce();
    expect(workspaceController.applyFileChanges).toHaveBeenCalledWith([
      expect.objectContaining({ path: 'src/index.js', content: 'console.log("hello");' }),
    ]);
    expect(workspaceController.getHealth).toHaveBeenCalledOnce();
    expect(workspaceController.dispose).toHaveBeenCalledOnce();
  });

  it('skips indexing until required state is ready', async () => {
    mockHealthState.mockReturnValue(undefined as never);

    renderHook(() => useWorkspaceIndexer());
    await flushIndex();

    expect(collectWorkspaceFiles).not.toHaveBeenCalled();
  });

  it('uses safe defaults for an empty profile, mode, and editor snapshot', async () => {
    mockUseFileSystem.mockReturnValue({
      isReady: true,
      version: 1,
      mode: undefined,
      rootHandle: null,
    } as never);
    mockEditorState.mockReturnValue({ fileContents: undefined } as never);
    mockProfileState.mockReturnValue(undefined as never);
    collectWorkspaceFiles.mockResolvedValue({});

    renderHook(() => useWorkspaceIndexer());
    await flushIndex();

    expect(collectWorkspaceFiles).toHaveBeenCalledWith(
      { mode: 'local', rootHandle: null },
      {},
      expect.any(Object),
    );
  });

  it('debounces rerenders before indexing the latest snapshot', async () => {
    const { rerender } = renderHook(() => useWorkspaceIndexer());
    mockEditorState.mockReturnValue({
      fileContents: { 'src/latest.js': 'export default true;' },
    } as never);
    collectWorkspaceFiles.mockResolvedValue({
      'src/latest.js': 'export default true;',
    });
    rerender();
    await flushIndex();

    expect(collectWorkspaceFiles).toHaveBeenCalledOnce();
    expect(workspaceController.applyFileChanges).toHaveBeenCalledWith([
      expect.objectContaining({ path: 'src/latest.js' }),
    ]);
  });

  it('reuses the editor snapshot after the first disk scan and removes deleted paths', async () => {
    const { rerender } = renderHook(() => useWorkspaceIndexer());
    await flushIndex();
    workspaceController.applyFileChanges.mockClear();

    mockEditorState.mockReturnValue({ fileContents: {} } as never);
    rerender();
    await flushIndex();

    expect(collectWorkspaceFiles).toHaveBeenCalledOnce();
    expect(workspaceController.applyFileChanges).toHaveBeenCalledWith([
      { path: 'src/index.js', deleted: true },
    ]);
  });

  it('does not resend unchanged content on a profile-only update', async () => {
    const { rerender } = renderHook(() => useWorkspaceIndexer());
    await flushIndex();
    workspaceController.applyFileChanges.mockClear();

    mockProfileState.mockReturnValue({
      include: [],
      exclude: ['node_modules/**'],
      maxFileBytes: 512 * 1024,
    } as never);
    rerender();
    await flushIndex();

    expect(workspaceController.applyFileChanges).not.toHaveBeenCalled();
    expect(workspaceController.getHealth).toHaveBeenCalledTimes(2);
  });

  it('records oversized files as skipped', async () => {
    mockProfileState.mockReturnValue({
      include: [],
      exclude: [],
      maxFileBytes: 1,
    } as never);

    renderHook(() => useWorkspaceIndexer());
    await flushIndex();

    const finalHealthUpdate = health.mock.calls.at(-1)?.[0];
    const draft = {} as Record<string, unknown>;
    finalHealthUpdate(draft);
    expect(draft.skippedFiles).toEqual([
      { path: 'src/index.js', reason: 'file exceeds index size limit' },
    ]);
  });

  it('surfaces index failures through workspace health', async () => {
    workspaceController.getHealth.mockRejectedValue(new Error('health failed'));

    renderHook(() => useWorkspaceIndexer());
    await flushIndex();

    const finalHealthUpdate = health.mock.calls.at(-1)?.[0];
    const draft = {} as Record<string, unknown>;
    finalHealthUpdate(draft);
    expect(draft).toMatchObject({ status: 'error', error: 'health failed' });
  });
});
