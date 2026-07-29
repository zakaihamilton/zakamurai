import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { createMockEditorState, createMockTabState } from '@/test-utils/editorMocks';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import HistoryDropdown from '../HistoryDropdown';
import NavigationControls from './NavigationControls';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    ChevronLeft: () => <span />,
    ChevronRight: () => <span />,
    History: () => <span />,
  },
}));

describe('NavigationControls', () => {
  it('disables back and forward when history empty', () => {
    vi.spyOn(TabState, 'usePassiveState').mockReturnValue(createMockTabState());
    vi.spyOn(EditorState, 'useState').mockReturnValue(
      createMockEditorState({
        navigationHistory: { stack: [], currentIndex: -1 },
        fileContents: {},
      }),
    );

    render(<NavigationControls />);
    expect(screen.getByTestId('go-back-button')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('go-forward-button')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('history-dropdown-button')).toHaveProperty('disabled', true);
  });

  it('enables back when history has prior entries', () => {
    const tabState = createMockTabState();
    const editorState = createMockEditorState({
      navigationHistory: {
        stack: [
          { filePath: 'src/a.js', label: 'a.js', loc: { line: 1, col: 1, index: 0 } },
          { filePath: 'src/b.js', label: 'b.js', loc: { line: 2, col: 1, index: 0 } },
        ],
        currentIndex: 1,
      },
      fileContents: { 'src/a.js': 'a', 'src/b.js': 'b' },
    });
    vi.spyOn(TabState, 'usePassiveState').mockReturnValue(tabState);
    vi.spyOn(EditorState, 'useState').mockReturnValue(editorState);

    render(<NavigationControls />);
    expect(screen.getByTestId('go-back-button')).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByTestId('go-back-button'));
    expect(tabState).toHaveBeenCalled();
    expect(editorState).toHaveBeenCalled();
  });
});

describe('HistoryDropdown', () => {
  const history = {
    stack: [{ filePath: 'src/foo.js', label: 'foo.js', loc: { line: 5, col: 1, index: 0 } }],
    currentIndex: 0,
  };

  it('returns null when closed', () => {
    const { container } = render(
      <HistoryDropdown
        isOpen={false}
        onClose={vi.fn()}
        history={history}
        onItemClick={vi.fn()}
        onClearHistory={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('lists history items when open', () => {
    const onItemClick = vi.fn();
    render(
      <HistoryDropdown
        isOpen={true}
        onClose={vi.fn()}
        history={history}
        onItemClick={onItemClick}
        onClearHistory={vi.fn()}
      />,
    );

    expect(screen.getByTestId('history-dropdown')).toBeDefined();
    fireEvent.click(screen.getByTestId('history-item-0'));
    expect(onItemClick).toHaveBeenCalledWith(0);
  });

  it('clears history', () => {
    const onClearHistory = vi.fn();
    render(
      <HistoryDropdown
        isOpen={true}
        onClose={vi.fn()}
        history={history}
        onItemClick={vi.fn()}
        onClearHistory={onClearHistory}
      />,
    );

    fireEvent.click(screen.getByTestId('clear-history-button'));
    expect(onClearHistory).toHaveBeenCalled();
  });
});
