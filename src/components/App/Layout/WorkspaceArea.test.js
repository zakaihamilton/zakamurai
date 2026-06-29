import { AppState } from '@/components/App/AppState';
import { PromptState, SidebarState, TabState } from '@/components/App/Panes';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceArea from './WorkspaceArea';

vi.mock('@/components/App/AppState', () => ({ AppState: { useState: vi.fn() } }));
vi.mock('@/components/App/Panes', () => ({
  TabState: { useState: vi.fn() },
  SidebarState: { useState: vi.fn() },
  PromptState: { useState: vi.fn() },
  TabBar: () => <div data-testid="tab-bar" />,
  Prompt: () => <div data-testid="prompt" />,
}));
vi.mock('@/components/ui/Resizer/Resizer', () => ({
  default: () => <div data-testid="resizer" />,
}));
vi.mock('../Views/EditorArea', () => ({
  default: () => <div data-testid="editor-area" />,
}));
vi.mock('../Views/Welcome', () => ({
  default: () => <div data-testid="welcome" />,
}));
vi.mock('../Views/LogArea', () => ({ default: () => <div data-testid="log-area" /> }));
vi.mock('../Views/PreviewArea', () => ({ default: () => <div data-testid="preview-area" /> }));
vi.mock('../Views/ProjectInfo', () => ({ default: () => <div data-testid="project-info" /> }));
vi.mock('../Views/Instructions', () => ({ default: () => <div data-testid="instructions" /> }));
vi.mock('../Views/TokenBreakdown', () => ({
  default: () => <div data-testid="token-breakdown" />,
}));
vi.mock('../Views/ImageViewer', () => ({ default: () => <div data-testid="image-viewer" /> }));

describe('WorkspaceArea', () => {
  it('renders welcome when no active tab', () => {
    AppState.useState.mockReturnValue({ isMobile: false });
    TabState.useState.mockReturnValue({ openTabs: [], activeTabId: null });
    SidebarState.useState.mockReturnValue({ showAIInput: true });
    PromptState.useState.mockReturnValue(vi.fn());

    render(<WorkspaceArea />);
    expect(screen.getByTestId('tab-bar')).toBeDefined();
    expect(screen.getByTestId('welcome')).toBeDefined();
    expect(screen.getByTestId('prompt')).toBeDefined();
  });

  it('renders log area for logs tab', () => {
    AppState.useState.mockReturnValue({ isMobile: false });
    TabState.useState.mockReturnValue({
      openTabs: [{ id: 'ai-logs', type: 'logs', label: 'Logs' }],
      activeTabId: 'ai-logs',
    });
    SidebarState.useState.mockReturnValue({ showAIInput: false });
    PromptState.useState.mockReturnValue(vi.fn());

    render(<WorkspaceArea />);
    expect(screen.getByTestId('log-area')).toBeDefined();
  });
});
