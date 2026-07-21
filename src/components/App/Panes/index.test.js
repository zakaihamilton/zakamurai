import { describe, expect, it, vi } from 'vitest';
import {
  Prompt,
  PromptState,
  Sidebar,
  SidebarState,
  StatusBar,
  TabBar,
  TabState,
  TopBar,
} from './index';

vi.mock('./Sidebar', () => ({
  default: 'mockSidebar',
  SidebarState: 'mockSidebarState',
}));

vi.mock('./StatusBar', () => ({
  default: 'mockStatusBar',
}));

vi.mock('./Prompt', () => ({
  default: 'mockPrompt',
  PromptState: 'mockPromptState',
}));

vi.mock('./TabBar', () => ({
  default: 'mockTabBar',
  TabState: 'mockTabState',
}));

vi.mock('./TopBar', () => ({
  default: 'mockTopBar',
}));

describe('Panes index', () => {
  it('exports Sidebar, StatusBar, Prompt, TabBar, TopBar, and their states', () => {
    expect(Sidebar).toBe('mockSidebar');
    expect(SidebarState).toBe('mockSidebarState');
    expect(StatusBar).toBe('mockStatusBar');
    expect(Prompt).toBe('mockPrompt');
    expect(PromptState).toBe('mockPromptState');
    expect(TabBar).toBe('mockTabBar');
    expect(TabState).toBe('mockTabState');
    expect(TopBar).toBe('mockTopBar');
  });
});
