import type { ReactNode } from 'react';
import { AppState } from '@/components/App/AppState';
import { PromptState, SidebarState, TabState } from '@/components/App/Panes';
import {
  makeAppState,
  makePromptState,
  makeSidebarState,
  makeTabState,
} from '@/test-utils/stateMocks';
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
  default: ({
    onResize,
    onResizeStart,
    onResizeEnd,
    onDoubleClick,
  }: {
    onResize?: (clientX: number) => void;
    onResizeStart?: () => void;
    onResizeEnd?: () => void;
    onDoubleClick?: () => void;
  }) => (
    <div
      data-testid="resizer"
      onMouseDown={onResizeStart}
      onMouseUp={onResizeEnd}
      onDoubleClick={onDoubleClick}
      onMouseMove={(e) => onResize?.(e.clientX)}
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
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

describe('WorkspaceArea', () => {
  it('renders welcome when no active tab', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: false }));
    vi.mocked(TabState.useState).mockReturnValue(makeTabState({ openTabs: [], activeTabId: null }));
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState({ showAIInput: true }));
    vi.mocked(PromptState.useState).mockReturnValue(makePromptState());

    render(<WorkspaceArea />);
    expect(screen.getByTestId('tab-bar')).toBeDefined();
    expect(screen.getByTestId('welcome')).toBeDefined();
    expect(screen.getByTestId('prompt')).toBeDefined();
  });

  it('renders log area for logs tab', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: false }));
    vi.mocked(TabState.useState).mockReturnValue(
      makeTabState({
        openTabs: [{ id: 'logs', type: 'logs', label: 'Logs' }],
        activeTabId: 'logs',
      }),
    );
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState({ showAIInput: false }));
    vi.mocked(PromptState.useState).mockReturnValue(makePromptState());

    render(<WorkspaceArea />);
    expect(screen.getByTestId('log-area')).toBeDefined();
  });

  it('renders preview area for preview tab', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: false }));
    vi.mocked(TabState.useState).mockReturnValue(
      makeTabState({
        openTabs: [{ id: 'preview', type: 'preview', label: 'Preview' }],
        activeTabId: 'preview',
      }),
    );
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState({ showAIInput: false }));
    vi.mocked(PromptState.useState).mockReturnValue(makePromptState());

    render(<WorkspaceArea />);
    expect(screen.getByTestId('preview-area')).toBeDefined();
  });

  it('renders project info for project-info tab', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: false }));
    vi.mocked(TabState.useState).mockReturnValue(
      makeTabState({
        openTabs: [{ id: 'info', type: 'project-info', label: 'Info' }],
        activeTabId: 'info',
      }),
    );
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState({ showAIInput: false }));
    vi.mocked(PromptState.useState).mockReturnValue(makePromptState());

    render(<WorkspaceArea />);
    expect(screen.getByTestId('project-info')).toBeDefined();
  });

  it('renders instructions for instructions tab', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: false }));
    vi.mocked(TabState.useState).mockReturnValue(
      makeTabState({
        openTabs: [{ id: 'instructions', type: 'instructions', label: 'Instructions' }],
        activeTabId: 'instructions',
      }),
    );
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState({ showAIInput: false }));
    vi.mocked(PromptState.useState).mockReturnValue(makePromptState());

    render(<WorkspaceArea />);
    expect(screen.getByTestId('instructions')).toBeDefined();
  });

  it('renders token breakdown tab type', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: false }));
    vi.mocked(TabState.useState).mockReturnValue(
      makeTabState({
        openTabs: [{ id: 'tokens', type: 'token-breakdown', label: 'Tokens' }],
        activeTabId: 'tokens',
      }),
    );
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState({ showAIInput: false }));
    vi.mocked(PromptState.useState).mockReturnValue(makePromptState());

    render(<WorkspaceArea />);
    expect(screen.getByTestId('token-breakdown')).toBeDefined();
  });

  it('hides resizer on mobile', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: true }));
    vi.mocked(TabState.useState).mockReturnValue(makeTabState());
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState({ showAIInput: true }));
    vi.mocked(PromptState.useState).mockReturnValue(makePromptState());

    render(<WorkspaceArea />);
    expect(screen.queryByTestId('resizer')).toBeNull();
  });

  it('shows resizer on desktop when AI input is open', () => {
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: false }));
    vi.mocked(TabState.useState).mockReturnValue(makeTabState());
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState({ showAIInput: true }));
    vi.mocked(PromptState.useState).mockReturnValue(makePromptState({ promptWidth: 360 }));

    render(<WorkspaceArea />);
    expect(screen.getByTestId('resizer')).toBeDefined();
  });

  it('updates prompt width on resize', () => {
    const promptState = makePromptState({ promptWidth: 360 });
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: false }));
    vi.mocked(TabState.useState).mockReturnValue(makeTabState());
    vi.mocked(SidebarState.useState).mockReturnValue(makeSidebarState({ showAIInput: true }));
    vi.mocked(PromptState.useState).mockReturnValue(promptState);

    const { getByTestId } = render(<WorkspaceArea />);
    fireEvent.mouseMove(getByTestId('resizer'), { clientX: 100 });
    expect(promptState).toHaveBeenCalled();
  });
});
