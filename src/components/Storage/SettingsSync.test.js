import Settings from '@/components/Storage/Settings';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
      setAgentSessions: vi.fn(),
      setActiveAgentSessionId: vi.fn(),
    },
  };
});

describe('useSettingsSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates Settings when state dependencies change', () => {
    const appState = { theme: 'dark', projectName: 'TestProj' };
    const sidebarState = {
      sidebarWidth: 250,
      isSidebarOpen: true,
      showAIInput: false,
      expandedFolders: ['src'],
    };
    const promptState = { promptWidth: 400 };
    const editorState = { aiCompletionEnabled: true };
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

    const { rerender } = renderHook(
      ({ app, sidebar, prompt, editor, agents }) =>
        useSettingsSync(app, sidebar, prompt, editor, agents),
      {
        initialProps: {
          app: appState,
          sidebar: sidebarState,
          prompt: promptState,
          editor: editorState,
          agents: agentSessionState,
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
    expect(Settings.setAgentSessions).toHaveBeenCalled();
    expect(Settings.setActiveAgentSessionId).toHaveBeenCalledWith('session-1');

    rerender({
      app: { theme: 'light', projectName: 'NewProj' },
      sidebar: {
        sidebarWidth: 300,
        isSidebarOpen: false,
        showAIInput: true,
        expandedFolders: ['src', 'components'],
      },
      prompt: { promptWidth: 450 },
      editor: { aiCompletionEnabled: false },
      agents: agentSessionState,
    });

    expect(Settings.setTheme).toHaveBeenCalledWith('light');
    expect(Settings.setProjectName).toHaveBeenCalledWith('NewProj');
    expect(Settings.setSidebarWidth).toHaveBeenCalledWith(300);
    expect(Settings.setIsSidebarOpen).toHaveBeenCalledWith(false);
    expect(Settings.setShowAIInput).toHaveBeenCalledWith(true);
    expect(Settings.setExpandedFolders).toHaveBeenCalledWith(['src', 'components']);
    expect(Settings.setPromptWidth).toHaveBeenCalledWith(450);
    expect(Settings.setAICompletionEnabled).toHaveBeenCalledWith(false);
  });
});
