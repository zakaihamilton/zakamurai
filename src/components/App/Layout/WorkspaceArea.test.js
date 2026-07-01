import { AppState } from '@/components/App/AppState';
import { PromptState, SidebarState, TabState } from '@/components/App/Panes';
import { fireEvent, render, screen } from '@testing-library/react';
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
vi.mock('@/components/ui/Resizer', () => ({
  default: ({ onResize, onResizeStart, onResizeEnd, onDoubleClick }) => (
    <div
      data-testid="resizer"
      onMouseDown={onResizeStart}
      onMouseUp={onResizeEnd}
      onDoubleClick={onDoubleClick}
      onMouseMove={(e) => onResize && onResize(e.clientX)}
    />
  ),
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
vi.mock('../../state/Node', () => ({
  default: ({ children }) => <>{children}</>,
}));

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

  it('renders preview area for preview tab', () => {
    AppState.useState.mockReturnValue({ isMobile: false });
    TabState.useState.mockReturnValue({
      openTabs: [{ id: 'preview-tab', type: 'preview', label: 'Preview' }],
      activeTabId: 'preview-tab',
    });
    SidebarState.useState.mockReturnValue({ showAIInput: false });
    PromptState.useState.mockReturnValue(vi.fn());

    render(<WorkspaceArea />);
    expect(screen.getByTestId('preview-area')).toBeDefined();
  });

  it('renders project info area for project info tab', () => {
    AppState.useState.mockReturnValue({ isMobile: false });
    TabState.useState.mockReturnValue({
      openTabs: [{ id: 'project-info', type: 'project-info', label: 'Info' }],
      activeTabId: 'project-info',
    });
    SidebarState.useState.mockReturnValue({ showAIInput: false });
    PromptState.useState.mockReturnValue(vi.fn());

    render(<WorkspaceArea />);
    expect(screen.getByTestId('project-info')).toBeDefined();
  });

  it('renders instructions area for instructions tab', () => {
    AppState.useState.mockReturnValue({ isMobile: false });
    TabState.useState.mockReturnValue({
      openTabs: [{ id: 'instructions', type: 'instructions', label: 'Instructions' }],
      activeTabId: 'instructions',
    });
    SidebarState.useState.mockReturnValue({ showAIInput: false });
    PromptState.useState.mockReturnValue(vi.fn());

    render(<WorkspaceArea />);
    expect(screen.getByTestId('instructions')).toBeDefined();
  });

  it('renders token breakdown view', () => {
    AppState.useState.mockReturnValue({ isMobile: false });
    TabState.useState.mockReturnValue({
      openTabs: [{ id: 'test.js', type: 'file', viewType: 'token-breakdown', file: { name: 'test.js' } }],
      activeTabId: 'test.js',
    });
    SidebarState.useState.mockReturnValue({ showAIInput: false });
    PromptState.useState.mockReturnValue(vi.fn());

    render(<WorkspaceArea />);
    expect(screen.getByTestId('token-breakdown')).toBeDefined();
  });

  it('renders image viewer for image files', () => {
    AppState.useState.mockReturnValue({ isMobile: false });
    TabState.useState.mockReturnValue({
      openTabs: [{ id: 'image.png', type: 'file', file: { name: 'image.png' } }],
      activeTabId: 'image.png',
    });
    SidebarState.useState.mockReturnValue({ showAIInput: false });
    PromptState.useState.mockReturnValue(vi.fn());

    render(<WorkspaceArea />);
    expect(screen.getByTestId('image-viewer')).toBeDefined();
  });

  it('renders Resizer and triggers resize handlers in non-mobile mode', () => {
    const appState = Object.assign(vi.fn(), { isMobile: false, isResizing: false });
    const promptState = Object.assign(vi.fn(), { promptWidth: 360 });
    AppState.useState.mockReturnValue(appState);
    TabState.useState.mockReturnValue({ openTabs: [], activeTabId: null });
    SidebarState.useState.mockReturnValue({ showAIInput: true });
    PromptState.useState.mockReturnValue(promptState);

    render(<WorkspaceArea />);
    const resizer = screen.getByTestId('resizer');
    expect(resizer).toBeDefined();

    // Trigger resize start
    fireEvent.mouseDown(resizer);
    expect(appState).toHaveBeenCalled();

    // Trigger resize end
    fireEvent.mouseUp(resizer);

    // Trigger double click (reset prompt width)
    fireEvent.doubleClick(resizer);
    expect(promptState).toHaveBeenCalled();
  });

  it('does not render Resizer in mobile mode', () => {
    AppState.useState.mockReturnValue({ isMobile: true });
    TabState.useState.mockReturnValue({ openTabs: [], activeTabId: null });
    SidebarState.useState.mockReturnValue({ showAIInput: false });
    PromptState.useState.mockReturnValue(vi.fn());

    render(<WorkspaceArea />);
    expect(screen.queryByTestId('resizer')).toBeNull();
  });
});
