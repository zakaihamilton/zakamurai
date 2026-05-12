import { beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from './Settings';

describe('Settings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('gets and sets project name', () => {
    expect(Settings.getProjectName('Default')).toBe('Default');
    Settings.setProjectName('New Project');
    expect(Settings.getProjectName()).toBe('New Project');
  });

  it('gets and sets theme', () => {
    expect(Settings.getTheme('dark')).toBe('dark');
    Settings.setTheme('light');
    expect(Settings.getTheme()).toBe('light');
  });

  it('gets and sets open tabs', () => {
    const tabs = [{ id: '1', type: 'file', label: 'test.js' }];
    Settings.setOpenTabs(tabs);
    const savedTabs = Settings.getOpenTabs();
    expect(savedTabs).toHaveLength(1);
    expect(savedTabs[0].id).toBe('1');
  });

  it('adds to prompt history', () => {
    Settings.addPromptHistory('hello');
    Settings.addPromptHistory('world');
    Settings.addPromptHistory('hello'); // duplicate
    const history = Settings.getPromptHistory();
    expect(history).toEqual(['hello', 'world']);
  });

  it('gets and sets sidebar width', () => {
    expect(Settings.getSidebarWidth(260)).toBe(260);
    Settings.setSidebarWidth(300);
    expect(Settings.getSidebarWidth()).toBe(300);
  });

  it('gets and sets AI completion enabled', () => {
    expect(Settings.getAICompletionEnabled(true)).toBe(true);
    Settings.setAICompletionEnabled(false);
    expect(Settings.getAICompletionEnabled()).toBe(false);
    Settings.setAICompletionEnabled(true);
    expect(Settings.getAICompletionEnabled()).toBe(true);
  });

  it('resets settings', () => {
    Settings.setProjectName('Test');
    Settings.reset();
    expect(Settings.getProjectName('Default')).toBe('Default');
  });
});
