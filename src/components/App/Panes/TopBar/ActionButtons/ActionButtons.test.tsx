import type { ReactNode } from 'react';
import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { PreviewState } from '@/components/App/PreviewState';
import { LogState } from '@/components/App/Views/LogArea';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ActionButtons from './ActionButtons';

vi.mock('@/components/App/AppState', () => ({ AppState: { useState: vi.fn() } }));
vi.mock('@/components/App/Panes/Sidebar', () => ({ SidebarState: { useState: vi.fn() } }));
vi.mock('@/components/App/Panes/TabBar', () => ({ TabState: { useState: vi.fn() } }));
vi.mock('@/components/App/PreviewState', () => ({ PreviewState: { useState: vi.fn() } }));
vi.mock('@/components/App/Views/LogArea', () => ({ LogState: { useState: vi.fn() } }));
vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children, content }) => <div data-tooltip-content={content}>{children}</div>,
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
    vi.mocked(LogState.useState).mockReturnValue({ isSystemProcessing: false });
    vi.mocked(PreviewState.useState).mockReturnValue({ compileStatus: 'idle', compilePhase: null });
    vi.mocked(AppState.useState).mockReturnValue({ isMobile: false });
    vi.mocked(SidebarState.useState).mockReturnValue({ showAIInput: true, isAIInputPopupOpen: false });
  });

  it('renders action buttons', () => {
    const tabState = Object.assign(vi.fn(), {
      activeTabId: 'src/foo.js',
      openTabs: [{ id: 'src/foo.js', type: 'file', label: 'foo.js' }],
      lastCodeTabId: 'src/foo.js',
    });
    vi.mocked(TabState.useState).mockReturnValue(tabState);

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
    vi.mocked(TabState.useState).mockReturnValue(tabState);

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

  it('shows the active compile phase in the build tooltip', () => {
    vi.mocked(LogState.useState).mockReturnValue({ isSystemProcessing: true });
    vi.mocked(PreviewState.useState).mockReturnValue({
      compileStatus: 'building',
      compilePhase: '[NPM] Downloading nanoid@3.3.16…',
    });
    const tabState = Object.assign(vi.fn(), {
      activeTabId: 'src/foo.js',
      openTabs: [{ id: 'src/foo.js', type: 'file', label: 'foo.js' }],
      lastCodeTabId: 'src/foo.js',
    });
    vi.mocked(TabState.useState).mockReturnValue(tabState);

    render(
      <ActionButtons
        onCompile={vi.fn()}
        onOpenLog={vi.fn()}
        onOpenPreview={vi.fn()}
        onToggleAIInput={vi.fn()}
      />,
    );

    expect(screen.getByTestId('compile-btn')).toBeDisabled();
    expect(screen.getByTestId('compile-btn').parentElement).toHaveAttribute(
      'data-tooltip-content',
      '[NPM] Downloading nanoid@3.3.16…',
    );
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
    vi.mocked(TabState.useState).mockReturnValue(tabState);

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
