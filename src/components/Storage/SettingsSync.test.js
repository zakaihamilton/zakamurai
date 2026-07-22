import Settings from '@/components/Storage/Settings';
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
      setPromptHistory: vi.fn(),
      setOpenTabs: vi.fn(),
      setActiveTabId: vi.fn(),
      setLastCodeTabId: vi.fn(),
      setAILogs: vi.fn(),
      setPreviewHtml: vi.fn(),
      setFileContents: vi.fn(),
      setPendingDiffs: vi.fn(),
      setAgentSessions: vi.fn(),
      setActiveAgentSessionId: vi.fn(),
    },
  };
});

describe('useSettingsSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates Settings when state dependencies change', () => {
    const appState = { theme: 'dark', projectName: 'TestProj' };
    const sidebarState = {
      sidebarWidth: 250,
      isSidebarOpen: true,
      showAIInput: false,
      expandedFolders: ['src'],
    };
    const promptState = { promptWidth: 400, promptHistory: ['hello'] };
    const editorState = {
      aiCompletionEnabled: true,
      isReadOnly: false,
      fileContents: { 'a.js': 'code' },
      pendingDiffs: {
        'a.js': { originalContent: 'old', diffs: [], modifiedContent: 'code' },
        'bad.js': { originalContent: 1, diffs: null },
      },
    };
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
        },
      },
      activeSessionId: 'session-1',
    };
    const tabState = {
      openTabs: [{ id: 'a.js', type: 'file', label: 'a.js' }],
      activeTabId: 'a.js',
      lastCodeTabId: 'a.js',
    };
    const logState = { logs: [{ id: '1', text: 'hi' }] };
    const previewState = { htmlContent: '<html></html>' };
    const promptUiState = {
      val: 'draft text',
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
    expect(Settings.setExpandedFolders).toHaveBeenCalledWith(['src']);
    expect(Settings.setPromptWidth).toHaveBeenCalledWith(400);
    expect(Settings.setAICompletionEnabled).toHaveBeenCalledWith(true);
    expect(Settings.setEditorReadOnly).toHaveBeenCalledWith(false);
    expect(Settings.setAIPromptModel).toHaveBeenCalledWith('Qwen3.5-4B-q4f16_1-MLC');
    expect(Settings.setPromptHistory).toHaveBeenCalledWith(['hello']);
    expect(Settings.setOpenTabs).toHaveBeenCalledWith(tabState.openTabs);
    expect(Settings.setActiveTabId).toHaveBeenCalledWith('a.js');
    expect(Settings.setLastCodeTabId).toHaveBeenCalledWith('a.js');
    expect(Settings.setAILogs).toHaveBeenCalledWith(logState.logs);
    expect(Settings.setPreviewHtml).toHaveBeenCalledWith('<html></html>');
    expect(Settings.setAgentSessions).toHaveBeenCalled();
    expect(Settings.setActiveAgentSessionId).toHaveBeenCalledWith('session-1');

    expect(Settings.setPromptDraft).not.toHaveBeenCalled();
    expect(Settings.setFileContents).not.toHaveBeenCalled();
    expect(Settings.setPendingDiffs).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(Settings.setPromptDraft).toHaveBeenCalledWith('draft text');

    act(() => {
      vi.advanceTimersByTime(750);
    });
    expect(Settings.setFileContents).toHaveBeenCalledWith({ 'a.js': 'code' });
    expect(Settings.setPendingDiffs).toHaveBeenCalledWith({
      'a.js': { originalContent: 'old', diffs: [], modifiedContent: 'code' },
    });

    rerender({
      app: { theme: 'light', projectName: 'NewProj' },
      sidebar: {
        sidebarWidth: 300,
        isSidebarOpen: false,
        showAIInput: true,
        expandedFolders: ['src', 'components'],
      },
      prompt: { promptWidth: 450, promptHistory: ['hello', 'world'] },
      editor: {
        aiCompletionEnabled: false,
        isReadOnly: true,
        fileContents: { 'a.js': 'updated' },
        pendingDiffs: {},
      },
      agents: agentSessionState,
      tabs: { openTabs: [], activeTabId: null, lastCodeTabId: null },
      logs: { logs: [] },
      preview: { htmlContent: null },
      promptUi: { val: '', selectedModel: 'Qwen3.5-9B-q4f16_1-MLC' },
    });

    expect(Settings.setTheme).toHaveBeenCalledWith('light');
    expect(Settings.setProjectName).toHaveBeenCalledWith('NewProj');
    expect(Settings.setSidebarWidth).toHaveBeenCalledWith(300);
    expect(Settings.setIsSidebarOpen).toHaveBeenCalledWith(false);
    expect(Settings.setShowAIInput).toHaveBeenCalledWith(true);
    expect(Settings.setExpandedFolders).toHaveBeenCalledWith(['src', 'components']);
    expect(Settings.setPromptWidth).toHaveBeenCalledWith(450);
    expect(Settings.setAICompletionEnabled).toHaveBeenCalledWith(false);
    expect(Settings.setEditorReadOnly).toHaveBeenCalledWith(true);
    expect(Settings.setAIPromptModel).toHaveBeenCalledWith('Qwen3.5-9B-q4f16_1-MLC');
    expect(Settings.setPromptHistory).toHaveBeenCalledWith(['hello', 'world']);
    expect(Settings.setLastCodeTabId).toHaveBeenCalledWith(null);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(Settings.setPromptDraft).toHaveBeenCalledWith('');
    expect(Settings.setFileContents).toHaveBeenCalledWith({ 'a.js': 'updated' });
    expect(Settings.setPendingDiffs).toHaveBeenCalledWith({});
  });
});
