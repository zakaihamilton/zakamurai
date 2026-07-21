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

    const { rerender } = renderHook(
      ({ app, sidebar, prompt, editor }) => useSettingsSync(app, sidebar, prompt, editor),
      {
        initialProps: {
          app: appState,
          sidebar: sidebarState,
          prompt: promptState,
          editor: editorState,
        },
      },
    );

    // Initial effect runs
    expect(Settings.setTheme).toHaveBeenCalledWith('dark');
    expect(Settings.setProjectName).toHaveBeenCalledWith('TestProj');
    expect(Settings.setSidebarWidth).toHaveBeenCalledWith(250);
    expect(Settings.setIsSidebarOpen).toHaveBeenCalledWith(true);
    expect(Settings.setShowAIInput).toHaveBeenCalledWith(false);
    expect(Settings.setExpandedFolders).toHaveBeenCalledWith(['src']);
    expect(Settings.setPromptWidth).toHaveBeenCalledWith(400);
    expect(Settings.setAICompletionEnabled).toHaveBeenCalledWith(true);

    // Update props and verify changes are synced
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
