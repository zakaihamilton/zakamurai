import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { LogState } from '@/components/App/Views/LogArea';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ActionButtons from './ActionButtons';

vi.mock('@/components/App/AppState', () => ({ AppState: { useState: vi.fn() } }));
vi.mock('@/components/App/Panes/Sidebar', () => ({ SidebarState: { useState: vi.fn() } }));
vi.mock('@/components/App/Panes/TabBar', () => ({ TabState: { useState: vi.fn() } }));
vi.mock('@/components/App/Views/LogArea', () => ({ LogState: { useState: vi.fn() } }));
vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Play: () => <span />,
    Code: () => <span />,
    Terminal: () => <span />,
    Globe: () => <span />,
    AIPrompt: () => <span />,
  },
}));

describe('ActionButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    LogState.useState.mockReturnValue({ isSystemProcessing: false });
    AppState.useState.mockReturnValue({ isMobile: false });
    SidebarState.useState.mockReturnValue({ showAIInput: true, isAIInputPopupOpen: false });
  });

  it('renders action buttons', () => {
    const tabState = Object.assign(vi.fn(), {
      activeTabId: 'src/foo.js',
      openTabs: [{ id: 'src/foo.js', type: 'file', label: 'foo.js' }],
      lastCodeTabId: 'src/foo.js',
    });
    TabState.useState.mockReturnValue(tabState);

    render(
      <ActionButtons
        onCompile={vi.fn()}
        onOpenLog={vi.fn()}
        onOpenPreview={vi.fn()}
        onToggleAIInput={vi.fn()}
      />,
    );

    expect(screen.getByTestId('compile-btn')).toBeDefined();
    expect(screen.getByTestId('code-tab')).toBeDefined();
    expect(screen.getByTestId('logs-tab')).toBeDefined();
    expect(screen.getByTestId('preview-tab')).toBeDefined();
    expect(screen.getByTestId('ai-prompt-toggle')).toBeDefined();
  });

  it('calls handlers when buttons clicked', () => {
    const onCompile = vi.fn();
    const onOpenLog = vi.fn();
    const onOpenPreview = vi.fn();
    const onToggleAIInput = vi.fn();
    const tabState = Object.assign(vi.fn(), {
      activeTabId: 'ai-logs',
      openTabs: [{ id: 'src/foo.js', type: 'file', label: 'foo.js' }],
      lastCodeTabId: 'src/foo.js',
    });
    TabState.useState.mockReturnValue(tabState);

    render(
      <ActionButtons
        onCompile={onCompile}
        onOpenLog={onOpenLog}
        onOpenPreview={onOpenPreview}
        onToggleAIInput={onToggleAIInput}
      />,
    );

    fireEvent.click(screen.getByTestId('compile-btn'));
    fireEvent.click(screen.getByTestId('logs-tab'));
    fireEvent.click(screen.getByTestId('preview-tab'));
    fireEvent.click(screen.getByTestId('ai-prompt-toggle'));

    expect(onCompile).toHaveBeenCalled();
    expect(onOpenLog).toHaveBeenCalled();
    expect(onOpenPreview).toHaveBeenCalled();
    expect(onToggleAIInput).toHaveBeenCalled();
  });

  it('switches to last content tab via code tab', () => {
    const tabState = Object.assign(
      vi.fn((fn) => fn({ activeTabId: 'ai-logs', openTabs: [] })),
      {
        activeTabId: 'ai-logs',
        openTabs: [{ id: 'src/foo.js', type: 'file', label: 'foo.js' }],
        lastCodeTabId: 'src/foo.js',
      },
    );
    TabState.useState.mockReturnValue(tabState);

    render(
      <ActionButtons
        onCompile={vi.fn()}
        onOpenLog={vi.fn()}
        onOpenPreview={vi.fn()}
        onToggleAIInput={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('code-tab'));
    expect(tabState).toHaveBeenCalled();
  });
});
