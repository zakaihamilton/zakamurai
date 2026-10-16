import Settings from '@/components/Storage/Settings';
import { useNotification } from '@/components/ui/Notification';
import { createMockEditorState } from '@/test-utils/editorMocks';
import type { SidebarStateShape } from '@/types/domain-types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsSync } from './SettingsSync';

vi.mock('@/components/Storage/Settings', () => {
  return {
    default: {
      setTheme: vi.fn(),
      setProjectName: vi.fn(),
      setSidebarWidth: vi.fn(),
      setPromptWidth: vi.fn(),
      setIsSidebarOpen: vi.fn(),
      setShowAIInput: vi.fn(),
      setExpandedFolders: vi.fn(),
      setAICompletionEnabled: vi.fn(),
      setEditorReadOnly: vi.fn(),
      setAIPromptModel: vi.fn(),
      setPromptDraft: vi.fn(),
      setWelcomePromptDraft: vi.fn(),
      setPromptHistory: vi.fn(() => true),
      setOpenTabs: vi.fn(() => true),
      setActiveTabId: vi.fn(),
      setLastCodeTabId: vi.fn(),
      setAILogs: vi.fn(async () => true),
      setPreviewHtml: vi.fn(async () => true),
      setFileContents: vi.fn(async () => true),
      setPendingDiffs: vi.fn(async () => true),
      setPendingDeletions: vi.fn(async () => true),
      persistEditorBuffersSnapshot: vi.fn(async () => true),
      setAgentSessions: vi.fn(async () => true),
      setActiveAgentSessionId: vi.fn(),
      saveRecoveryCheckpoint: vi.fn(async () => true),
      setWorkspaceProfile: vi.fn(),
      setChangeSets: vi.fn(async () => true),
      getStorageHealth: vi.fn(() => ({ status: 'healthy', layer: 'indexeddb' })),
    },
  };
});

vi.mock('@/components/ui/Notification', () => ({
  useNotification: vi.fn(() => ({ addNotification: vi.fn() })),
}));

vi.mock('@/components/Storage/StorageHealth', () => ({
  StorageHealthState: { usePassiveState: vi.fn(() => vi.fn()) },
  requestRecoveryExport: vi.fn(),
  storageFailureMessage: vi.fn(() => 'Storage write failed'),
  storageHealthMessage: vi.fn((health) => health?.message || 'Storage healthy'),
}));

describe('useSettingsSync', () => {
  let addNotification: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    addNotification = vi.fn();
    vi.mocked(useNotification).mockReturnValue({ addNotification });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates Settings when state dependencies change', async () => {
    const appState = { theme: 'dark', projectName: 'TestProj' };
    const sidebarState: Pick<
      SidebarStateShape,
      'sidebarWidth' | 'isSidebarOpen' | 'showAIInput' | 'expandedFolders'
    > = {
      sidebarWidth: 250,
      isSidebarOpen: true,
      showAIInput: false,
      expandedFolders: { src: true },
    };
    const promptState = { promptWidth: 400, promptHistory: ['hello'] };
    const editorState = {
      aiCompletionEnabled: true,
      isReadOnly: false,
      fileContents: { 'a.js': 'code' },
      pendingDiffs: {
        'a.js': { originalContent: 'old', diffs: [], modifiedContent: 'code' },
        'bad.js': { originalContent: 'bad', diffs: [], modifiedContent: 'bad' },
      },
    } as never;
    const agentSessionState = {
      sessions: {
        'session-1': {
          id: 'session-1',
          name: 'Agent 1',
          createdAt: 1,
          updatedAt: 1,
          mode: 'single' as const,
          modelId: null,
          messages: [],
          reasoning: '',
          status: 'idle',
          parentId: null,
          roleGraph: null,
        },
      },
      activeSessionId: 'session-1',
    };
    const tabState = {
      openTabs: [{ id: 'a.js', type: 'file' as const, label: 'a.js' }],
      activeTabId: 'a.js',
      lastCodeTabId: 'a.js',
    };
    const logState = { logs: [{ id: '1', role: 'user', text: 'hi', timestamp: '2024-01-01' }] };
    const previewState = { htmlContent: '<html></html>' };
    const promptUiState = {
      val: 'draft text',
      welcomePrompt: 'welcome draft',
      selectedModel: 'Qwen3.5-4B-q4f16_1-MLC',
    };

    const { rerender } = renderHook(
      ({ app, sidebar, prompt, editor, agents, tabs, logs, preview, promptUi }) =>
        useSettingsSync(app, sidebar, prompt, editor, agents, tabs, logs, preview, promptUi),
      {
        initialProps: {
          app: appState,
          sidebar: sidebarState,
          prompt: promptState,
          editor: editorState,
          agents: agentSessionState,
          tabs: tabState,
          logs: logState,
          preview: previewState,
          promptUi: promptUiState,
        },
      },
    );

    expect(Settings.setTheme).toHaveBeenCalledWith('dark');
    expect(Settings.setProjectName).toHaveBeenCalledWith('TestProj');
    expect(Settings.setSidebarWidth).toHaveBeenCalledWith(250);
    expect(Settings.setIsSidebarOpen).toHaveBeenCalledWith(true);
    expect(Settings.setShowAIInput).toHaveBeenCalledWith(false);
    expect(Settings.setExpandedFolders).toHaveBeenCalledWith({ src: true });
    expect(Settings.setPromptWidth).toHaveBeenCalledWith(400);
    expect(Settings.setAICompletionEnabled).toHaveBeenCalledWith(true);
    expect(Settings.setEditorReadOnly).toHaveBeenCalledWith(false);
    expect(Settings.setAIPromptModel).toHaveBeenCalledWith('Qwen3.5-4B-q4f16_1-MLC');
    expect(Settings.setActiveTabId).toHaveBeenCalledWith('a.js');
    expect(Settings.setLastCodeTabId).toHaveBeenCalledWith('a.js');

    expect(Settings.setPromptHistory).not.toHaveBeenCalled();
    expect(Settings.setOpenTabs).not.toHaveBeenCalled();
    expect(Settings.setAILogs).not.toHaveBeenCalled();
    expect(Settings.setPreviewHtml).not.toHaveBeenCalled();
    expect(Settings.setAgentSessions).not.toHaveBeenCalled();
    expect(Settings.setPromptDraft).not.toHaveBeenCalled();
    expect(Settings.setWelcomePromptDraft).not.toHaveBeenCalled();
    expect(Settings.persistEditorBuffersSnapshot).not.toHaveBeenCalled();
    expect(Settings.setPendingDiffs).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(Settings.setPromptDraft).toHaveBeenCalledWith('draft text');
    expect(Settings.setWelcomePromptDraft).toHaveBeenCalledWith('welcome draft');

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(Settings.setPromptHistory).toHaveBeenCalledWith(['hello']);
    expect(Settings.setOpenTabs).toHaveBeenCalledWith(tabState.openTabs);
    expect(Settings.setAILogs).toHaveBeenCalledWith(logState.logs);
    expect(Settings.setPreviewHtml).toHaveBeenCalledWith('<html></html>');
    expect(Settings.setAgentSessions).toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
    });
    expect(Settings.setActiveAgentSessionId).toHaveBeenCalledWith('session-1');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(Settings.persistEditorBuffersSnapshot).not.toHaveBeenCalled();

    rerender({
      app: { theme: 'light', projectName: 'NewProj' },
      sidebar: {
        sidebarWidth: 300,
        isSidebarOpen: false,
        showAIInput: true,
        expandedFolders: { src: true, components: true },
      },
      prompt: { promptWidth: 450, promptHistory: ['hello', 'world'] },
      editor: {
        aiCompletionEnabled: false,
        isReadOnly: true,
        fileContents: { 'a.js': 'updated' },
        pendingDiffs: {} as Record<string, never>,
      } as never,
      agents: agentSessionState,
      tabs: { openTabs: [] as never[], activeTabId: null, lastCodeTabId: null } as never,
      logs: { logs: [] },
      preview: { htmlContent: null } as never,
      promptUi: {
        val: '',
        welcomePrompt: '',
        selectedModel: 'Qwen3.5-9B-q4f16_1-MLC',
      },
    });

    expect(Settings.setTheme).toHaveBeenCalledWith('light');
    expect(Settings.setProjectName).toHaveBeenCalledWith('NewProj');
    expect(Settings.setSidebarWidth).toHaveBeenCalledWith(300);
    expect(Settings.setIsSidebarOpen).toHaveBeenCalledWith(false);
    expect(Settings.setShowAIInput).toHaveBeenCalledWith(true);
    expect(Settings.setExpandedFolders).toHaveBeenCalledWith({ src: true, components: true });
    expect(Settings.setPromptWidth).toHaveBeenCalledWith(450);
    expect(Settings.setAICompletionEnabled).toHaveBeenCalledWith(false);
    expect(Settings.setEditorReadOnly).toHaveBeenCalledWith(true);
    expect(Settings.setAIPromptModel).toHaveBeenCalledWith('Qwen3.5-9B-q4f16_1-MLC');
    expect(Settings.setLastCodeTabId).toHaveBeenCalledWith(null);

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(Settings.setPromptDraft).toHaveBeenCalledWith('');
    expect(Settings.setPromptHistory).toHaveBeenCalledWith(['hello', 'world']);
    expect(Settings.persistEditorBuffersSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        fileContents: { 'a.js': 'updated' },
        pendingDiffs: {},
        pendingDeletions: {},
        recovery: expect.objectContaining({
          reason: 'storage-recovery',
          projectName: 'NewProj',
        }),
      }),
    );
  });

  it('deduplicates persistence failures and allows a later failure after recovery', async () => {
    vi.mocked(Settings.persistEditorBuffersSnapshot)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const baseArgs = [
      { theme: 'dark', projectName: 'Test' },
      { sidebarWidth: 250, isSidebarOpen: true, showAIInput: false, expandedFolders: {} },
      { promptWidth: 400, promptHistory: [] },
      null,
      { openTabs: [], activeTabId: null, lastCodeTabId: null },
      { logs: [] },
      { htmlContent: null },
      { val: '', selectedModel: 'model' },
    ];
    const editorState = (fileContents: Record<string, string>) => ({
      aiCompletionEnabled: true,
      isReadOnly: false,
      fileContents,
      pendingDiffs: {} as Record<string, never>,
    });
    const { rerender } = renderHook(
      ({ contents }) =>
        useSettingsSync(
          baseArgs[0] as never,
          baseArgs[1] as never,
          baseArgs[2] as never,
          editorState(contents),
          baseArgs[3] as never,
          baseArgs[4] as never,
          baseArgs[5] as never,
          baseArgs[6] as never,
          baseArgs[7] as never,
        ),
      { initialProps: { contents: { 'a.js': 'first failure' } } },
    );

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(addNotification).toHaveBeenCalledTimes(1);
    expect(addNotification.mock.calls[0][0]).toMatch(/storage is full/i);
    expect(addNotification.mock.calls[0][1]).toBe('error');

    rerender({ contents: { 'a.js': 'recovered' } });
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(addNotification).toHaveBeenCalledTimes(1);

    rerender({ contents: { 'a.js': 'second failure' } });
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(addNotification).toHaveBeenCalledTimes(2);
  });

  it('saves after 3 seconds of idle and enforces a 10-second maximum during typing', async () => {
    const editorFor = (tick: number) => ({
      aiCompletionEnabled: true,
      isReadOnly: false,
      fileContents: { 'a.js': `content-${tick}` },
      pendingDiffs: {},
    });
    const args = [
      { theme: 'dark', projectName: 'Test' },
      { sidebarWidth: 250, isSidebarOpen: true, showAIInput: false, expandedFolders: {} },
      { promptWidth: 400, promptHistory: [] },
      null,
      { openTabs: [], activeTabId: null, lastCodeTabId: null },
      { logs: [] },
      { htmlContent: null },
      { val: '', selectedModel: 'model' },
    ];
    const { rerender } = renderHook(
      ({ tick }) =>
        useSettingsSync(
          args[0] as never,
          args[1] as never,
          args[2] as never,
          editorFor(tick) as never,
          args[3] as never,
          args[4] as never,
          args[5] as never,
          args[6] as never,
          args[7] as never,
        ),
      { initialProps: { tick: 0 } },
    );

    await act(async () => {
      vi.advanceTimersByTime(2999);
      await Promise.resolve();
    });
    expect(Settings.persistEditorBuffersSnapshot).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(Settings.persistEditorBuffersSnapshot).toHaveBeenCalledOnce();

    vi.mocked(Settings.persistEditorBuffersSnapshot).mockClear();
    rerender({ tick: 0 });
    for (let tick = 1; tick <= 9; tick += 1) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      rerender({ tick });
    }
    expect(Settings.persistEditorBuffersSnapshot).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(Settings.persistEditorBuffersSnapshot).toHaveBeenCalledOnce();
    expect(Settings.persistEditorBuffersSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ fileContents: { 'a.js': 'content-9' } }),
    );
  });

  it('retains failed buffers and preserves edits made during an in-flight save', async () => {
    const args = [
      { theme: 'dark', projectName: 'Test' },
      { sidebarWidth: 250, isSidebarOpen: true, showAIInput: false, expandedFolders: {} },
      { promptWidth: 400, promptHistory: [] },
      null,
      { openTabs: [], activeTabId: null, lastCodeTabId: null },
      { logs: [] },
      { htmlContent: null },
      { val: '', selectedModel: 'model' },
    ];
    const editorState = createMockEditorState({
      fileContents: { 'a.js': 'committed' },
      dirtyBufferContents: { 'a.js': 'saved snapshot' },
    });
    let resolveSave: ((saved: boolean) => void) | undefined;
    vi.mocked(Settings.persistEditorBuffersSnapshot).mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const { rerender, unmount } = renderHook(
      ({ revision }) => {
        void revision;
        return useSettingsSync(
          args[0] as never,
          args[1] as never,
          args[2] as never,
          editorState,
          args[3] as never,
          args[4] as never,
          args[5] as never,
          args[6] as never,
          args[7] as never,
        );
      },
      { initialProps: { revision: 0 } },
    );

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(Settings.persistEditorBuffersSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ fileContents: { 'a.js': 'saved snapshot' } }),
    );

    act(() => {
      editorState((draft) => {
        draft.dirtyBufferContents = { 'a.js': 'concurrent edit' };
      });
    });
    rerender({ revision: 1 });
    await act(async () => {
      resolveSave?.(true);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(editorState.fileContents['a.js']).toBe('committed');
    expect(editorState.dirtyBufferContents?.['a.js']).toBe('concurrent edit');

    unmount();
    vi.mocked(Settings.persistEditorBuffersSnapshot).mockReset().mockResolvedValue(false);
    const failedState = createMockEditorState({
      fileContents: { 'b.js': 'committed' },
      dirtyBufferContents: { 'b.js': 'unsaved' },
    });
    const failedHook = renderHook(() =>
      useSettingsSync(
        args[0] as never,
        args[1] as never,
        args[2] as never,
        failedState,
        args[3] as never,
        args[4] as never,
        args[5] as never,
        args[6] as never,
        args[7] as never,
      ),
    );
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(failedState.fileContents['b.js']).toBe('committed');
    expect(failedState.dirtyBufferContents?.['b.js']).toBe('unsaved');
    failedHook.unmount();
  });

  it('does not update active session id when session write fails', async () => {
    vi.mocked(Settings.setAgentSessions).mockResolvedValue(false);

    const agentSessionState = {
      sessions: {
        'session-1': {
          id: 'session-1',
          name: 'Agent 1',
          createdAt: 1,
          updatedAt: 1,
          mode: 'single',
          modelId: null,
          messages: [],
          reasoning: '',
          status: 'idle',
          parentId: null,
          roleGraph: null,
        },
      },
      activeSessionId: 'session-1',
    } as never;

    renderHook(() =>
      useSettingsSync(
        { theme: 'dark', projectName: 'Test' },
        { sidebarWidth: 250, isSidebarOpen: true, showAIInput: false, expandedFolders: {} },
        { promptWidth: 400, promptHistory: [] },
        {
          aiCompletionEnabled: true,
          isReadOnly: false,
          fileContents: {},
          pendingDiffs: {} as Record<string, never>,
        },
        agentSessionState as never,
        { openTabs: [], activeTabId: null as string | null, lastCodeTabId: null as string | null },
        { logs: [] },
        { htmlContent: null as string | null },
        { val: '', welcomePrompt: '', selectedModel: 'model' },
      ),
    );

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Settings.setAgentSessions).toHaveBeenCalled();
    expect(Settings.setActiveAgentSessionId).not.toHaveBeenCalled();
    expect(addNotification).toHaveBeenCalledTimes(1);
  });

  it('syncs workspace profiles, change sets, and recovery checkpoints', async () => {
    const workspaceProfileState = { include: ['src'], exclude: ['dist'], maxFileBytes: 1024 };
    const changeSetState = { activeId: 'cs-1', items: [{ id: 'cs-1', files: {} }] };

    renderHook(() =>
      useSettingsSync(
        { theme: 'dark', projectName: 'Checkpoint' },
        { sidebarWidth: 250, isSidebarOpen: true, showAIInput: false, expandedFolders: {} },
        { promptWidth: 400, promptHistory: [] },
        {
          aiCompletionEnabled: true,
          isReadOnly: false,
          fileContents: { 'a.js': 'code' },
          pendingDiffs: {
            'a.js': { originalContent: 'old', diffs: [], modifiedContent: 'saved' },
          },
          pendingDeletions: {
            'old.js': { originalContent: 'gone', changeSetId: 'cs-1' },
          },
        },
        {
          sessions: {
            'session-1': {
              id: 'session-1',
              name: 'Agent 1',
              createdAt: 1,
              updatedAt: 1,
              mode: 'single',
              modelId: null,
              messages: [],
              reasoning: '',
              status: 'idle',
              parentId: null,
              roleGraph: null,
            },
          },
          activeSessionId: 'session-1',
        },
        {
          openTabs: [{ id: 'a.js', type: 'file', label: 'a.js' }],
          activeTabId: 'a.js',
          lastCodeTabId: 'a.js',
        },
        { logs: [] },
        { htmlContent: null },
        { val: 'draft', welcomePrompt: '', selectedModel: 'model' },
        workspaceProfileState as never,
        changeSetState as never,
      ),
    );

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Settings.setWorkspaceProfile).toHaveBeenCalledWith({
      include: ['src'],
      exclude: ['dist'],
      maxFileBytes: 1024,
      styleProfile: null,
    });
    expect(Settings.setChangeSets).toHaveBeenCalledWith({
      activeId: 'cs-1',
      items: changeSetState.items,
    });
    expect(Settings.persistEditorBuffersSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        fileContents: { 'a.js': 'code' },
        pendingDiffs: {
          'a.js': expect.objectContaining({ modifiedContent: 'saved' }),
        },
        pendingDeletions: {
          'old.js': { originalContent: 'gone', changeSetId: 'cs-1' },
        },
        recovery: expect.objectContaining({
          reason: 'storage-recovery',
          projectName: 'Checkpoint',
        }),
      }),
    );
  });

  it('warns once when storage quota is nearly full', async () => {
    vi.mocked(Settings.getStorageHealth).mockReturnValue({
      status: 'warning',
      layer: 'indexeddb',
      quotaWarning: true,
      message: 'Storage almost full',
      usage: null,
      quota: null,
      lastSuccessfulPersistAt: null,
    });
    vi.mocked(Settings.persistEditorBuffersSnapshot).mockResolvedValue(true);

    const { rerender } = renderHook(
      ({ contents }) =>
        useSettingsSync(
          { theme: 'dark', projectName: 'Test' },
          { sidebarWidth: 250, isSidebarOpen: true, showAIInput: false, expandedFolders: {} },
          { promptWidth: 400, promptHistory: [] },
          {
            aiCompletionEnabled: true,
            isReadOnly: false,
            fileContents: contents,
            pendingDiffs: {} as Record<string, never>,
          },
          null,
          { openTabs: [], activeTabId: null, lastCodeTabId: null },
          { logs: [] },
          { htmlContent: null },
          { val: '', welcomePrompt: '', selectedModel: 'model' },
        ),
      { initialProps: { contents: { 'a.js': 'first' } } },
    );

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(addNotification).toHaveBeenCalledWith(
      'Storage almost full',
      'warning',
      12000,
      expect.objectContaining({ label: 'Export ZIP' }),
    );

    rerender({ contents: { 'a.js': 'second' } });
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(addNotification).toHaveBeenCalledTimes(1);
  });

  it('skips invalid type guards and optional model/read-only sync', async () => {
    renderHook(() =>
      useSettingsSync(
        { theme: 'dark', projectName: 'Test' },
        { sidebarWidth: 250, isSidebarOpen: true, showAIInput: false, expandedFolders: {} },
        { promptWidth: 400, promptHistory: 'not-an-array' as never },
        {
          aiCompletionEnabled: true,
          isReadOnly: 'maybe',
          fileContents: null,
          pendingDiffs: null,
        } as never,
        null,
        { openTabs: 'bad', activeTabId: null, lastCodeTabId: null } as never,
        { logs: 'bad' } as never,
        { htmlContent: undefined } as never,
        { val: 42, selectedModel: null } as never,
      ),
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(Settings.setPromptHistory).not.toHaveBeenCalled();
    expect(Settings.setOpenTabs).not.toHaveBeenCalled();
    expect(Settings.setAILogs).not.toHaveBeenCalled();
    expect(Settings.persistEditorBuffersSnapshot).not.toHaveBeenCalled();
    expect(Settings.setPromptDraft).not.toHaveBeenCalled();
    expect(Settings.setPreviewHtml).not.toHaveBeenCalled();
    expect(Settings.setEditorReadOnly).not.toHaveBeenCalled();
    expect(Settings.setAIPromptModel).not.toHaveBeenCalled();
  });
});
