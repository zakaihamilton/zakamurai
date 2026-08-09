import { AppState } from '@/components/App/AppState';
import { SidebarState } from '@/components/App/Panes/Sidebar';
import { TabState } from '@/components/App/Panes/TabBar';
import { PreviewState } from '@/components/App/PreviewState';
import { LogState } from '@/components/App/Views/LogArea';
import { createMockTab } from '@/test-utils/editorMocks';
import {
  makeAppState,
  makeLogState,
  makePreviewState,
  makeSidebarState,
  makeTabState,
} from '@/test-utils/stateMocks';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ActionButtons from './ActionButtons';

vi.mock('@/components/App/AppState', () => ({ AppState: { useState: vi.fn() } }));
vi.mock('@/components/App/Panes/Sidebar', () => ({ SidebarState: { useState: vi.fn() } }));
vi.mock('@/components/App/Panes/TabBar', () => ({ TabState: { useState: vi.fn() } }));
vi.mock('@/components/App/PreviewState', () => ({ PreviewState: { useState: vi.fn() } }));
vi.mock('@/components/App/Views/LogArea', () => ({ LogState: { useState: vi.fn() } }));
vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children, content }: { children?: ReactNode; content?: string }) => (
    <div data-tooltip-content={content}>{children}</div>
  ),
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Play: () => <span />,
    Code: () => <span />,
    Terminal: () => <span />,
    Globe: () => <span />,
    ChevronDown: () => <span />,
    AIPrompt: () => <span />,
    Close: () => <span />,
  },
}));

describe('ActionButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(LogState.useState).mockReturnValue(makeLogState({ isSystemProcessing: false }));
    vi.mocked(PreviewState.useState).mockReturnValue(
      makePreviewState({ compileStatus: 'idle', compilePhase: null }),
    );
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: false }));
    vi.mocked(SidebarState.useState).mockReturnValue(
      makeSidebarState({ showAIInput: true, isAIInputPopupOpen: false }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders action buttons', () => {
    const tabState = makeTabState({
      activeTabId: 'src/foo.js',
      openTabs: [
        createMockTab({
          id: 'src/foo.js',
          type: 'file',
          label: 'foo.js',
          file: { name: 'foo.js', path: ['src', 'foo.js'] },
        }),
      ],
      lastCodeTabId: 'src/foo.js',
    });
    vi.mocked(TabState.useState).mockReturnValue(tabState);

    render(
      <ActionButtons
        onCompile={vi.fn()}
        onRebuild={vi.fn()}
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
    const onRebuild = vi.fn();
    const onOpenLog = vi.fn();
    const onOpenPreview = vi.fn();
    const onToggleAIInput = vi.fn();
    const tabState = makeTabState({
      activeTabId: 'ai-logs',
      openTabs: [
        createMockTab({
          id: 'src/foo.js',
          type: 'file',
          label: 'foo.js',
          file: { name: 'foo.js', path: ['src', 'foo.js'] },
        }),
      ],
      lastCodeTabId: 'src/foo.js',
    });
    vi.mocked(TabState.useState).mockReturnValue(tabState);

    render(
      <ActionButtons
        onCompile={onCompile}
        onRebuild={onRebuild}
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
    expect(onRebuild).not.toHaveBeenCalled();
    expect(onOpenLog).toHaveBeenCalled();
    expect(onOpenPreview).toHaveBeenCalled();
    expect(onToggleAIInput).toHaveBeenCalled();
  });

  it('changes to Rebuild and starts a fresh build after a held press', () => {
    vi.useFakeTimers();
    const onCompile = vi.fn();
    const onRebuild = vi.fn();
    vi.mocked(TabState.useState).mockReturnValue(makeTabState());

    render(
      <ActionButtons
        onCompile={onCompile}
        onRebuild={onRebuild}
        onOpenLog={vi.fn()}
        onOpenPreview={vi.fn()}
        onToggleAIInput={vi.fn()}
      />,
    );

    const button = screen.getByTestId('compile-btn');
    fireEvent.pointerDown(button);
    act(() => vi.advanceTimersByTime(600));

    expect(screen.getByText('Rebuild')).toBeDefined();

    fireEvent.pointerUp(button);
    fireEvent.click(button);

    expect(onRebuild).toHaveBeenCalledTimes(1);
    expect(onCompile).not.toHaveBeenCalled();
  });

  it('shows the active compile phase in the build tooltip', () => {
    vi.mocked(LogState.useState).mockReturnValue(makeLogState({ isSystemProcessing: true }));
    vi.mocked(PreviewState.useState).mockReturnValue(
      makePreviewState({
        compileStatus: 'building',
        compilePhase: '[NPM] Downloading nanoid@3.3.16…',
      }),
    );
    const tabState = makeTabState({
      activeTabId: 'src/foo.js',
      openTabs: [
        createMockTab({
          id: 'src/foo.js',
          type: 'file',
          label: 'foo.js',
          file: { name: 'foo.js', path: ['src', 'foo.js'] },
        }),
      ],
      lastCodeTabId: 'src/foo.js',
    });
    vi.mocked(TabState.useState).mockReturnValue(tabState);

    render(
      <ActionButtons
        onCompile={vi.fn()}
        onRebuild={vi.fn()}
        onOpenLog={vi.fn()}
        onOpenPreview={vi.fn()}
        onToggleAIInput={vi.fn()}
      />,
    );

    expect(screen.getByTestId('compile-btn')).toBeDisabled();
    expect(screen.getByTestId('compile-btn')).toHaveAccessibleName('Stop Build');
    expect(screen.getByText('Stop Build')).toBeDefined();
    expect(screen.getByTestId('compile-btn').parentElement).toHaveAttribute(
      'data-tooltip-content',
      'Stop Build — [NPM] Downloading nanoid@3.3.16…',
    );
  });

  it('uses the build slot to stop an active AI prompt', () => {
    const onStopAI = vi.fn();
    vi.mocked(LogState.useState).mockReturnValue(
      makeLogState({ isSystemProcessing: false, isAIProcessing: true }),
    );
    vi.mocked(TabState.useState).mockReturnValue(makeTabState());

    render(
      <ActionButtons
        onCompile={vi.fn()}
        onStopAI={onStopAI}
        onRebuild={vi.fn()}
        onOpenLog={vi.fn()}
        onOpenPreview={vi.fn()}
        onToggleAIInput={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('compile-btn'));

    expect(onStopAI).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('compile-btn')).toHaveAccessibleName('Stop Agent');
    expect(screen.getByText('Stop Agent')).toBeDefined();
  });

  it('switches to last content tab via code tab', () => {
    const tabState = makeTabState({
      activeTabId: 'ai-logs',
      openTabs: [
        createMockTab({
          id: 'src/foo.js',
          type: 'file',
          label: 'foo.js',
          file: { name: 'foo.js', path: ['src', 'foo.js'] },
        }),
      ],
      lastCodeTabId: 'src/foo.js',
    });
    vi.mocked(TabState.useState).mockReturnValue(tabState);

    render(
      <ActionButtons
        onCompile={vi.fn()}
        onRebuild={vi.fn()}
        onOpenLog={vi.fn()}
        onOpenPreview={vi.fn()}
        onToggleAIInput={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('code-tab'));
    expect(tabState).toHaveBeenCalled();
  });

  it('switches views from the mobile popup button', () => {
    const onOpenLog = vi.fn();
    const tabState = makeTabState({
      activeTabId: 'preview',
      openTabs: [
        { id: 'preview', type: 'preview', label: 'Preview' },
        createMockTab({
          id: 'src/foo.js',
          type: 'file',
          label: 'foo.js',
          file: { name: 'foo.js', path: ['src', 'foo.js'] },
        }),
      ],
      lastCodeTabId: 'src/foo.js',
    });
    vi.mocked(AppState.useState).mockReturnValue(makeAppState({ isMobile: true }));
    vi.mocked(TabState.useState).mockReturnValue(tabState);

    render(
      <ActionButtons
        onCompile={vi.fn()}
        onRebuild={vi.fn()}
        onOpenLog={onOpenLog}
        onOpenPreview={vi.fn()}
        onToggleAIInput={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('mobile-view-switcher'));
    expect(screen.getByRole('menu')).toBeDefined();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Logs' }));

    expect(onOpenLog).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
