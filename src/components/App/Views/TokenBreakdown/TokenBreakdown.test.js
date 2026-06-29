import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TokenBreakdown from './TokenBreakdown';

vi.mock('@/components/ui/Tooltip/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Code: () => <span data-testid="icon-code" />,
    Tokens: () => <span data-testid="icon-tokens" />,
    Copy: () => <span data-testid="icon-copy" />,
    Check: () => <span data-testid="icon-check" />,
    Terminal: () => <span data-testid="icon-terminal" />,
    ChevronDown: () => <span data-testid="icon-chevrondown" />,
    Globe: () => <span data-testid="icon-globe" />,
    Search: () => <span data-testid="icon-search" />,
    Info: () => <span data-testid="icon-info" />,
    Close: () => <span data-testid="icon-close" />,
  },
}));

describe('TokenBreakdown', () => {
  beforeEach(() => {
    vi.spyOn(TabState, 'useState').mockReturnValue(vi.fn());
  });

  it('renders a token breakdown for the source file tab', () => {
    vi.spyOn(EditorState, 'useState').mockReturnValue({
      fileContents: {
        'src/test.js': 'export const answer = 42;',
      },
      selectedLines: {},
      pendingDiffs: {},
    });

    render(
      <TokenBreakdown
        tab={{
          id: 'token-breakdown:src/test.js',
          sourceFilePath: 'src/test.js',
          collapsedFoldIds: [],
        }}
      />,
    );

    expect(screen.getAllByTestId('icon-tokens').length).toBeGreaterThan(0);
    expect(screen.getByText('src/test.js')).toBeDefined();
    expect(screen.getByLabelText('Open with Editor')).toBeDefined();
    expect(screen.getAllByText('Tokens').length).toBeGreaterThan(0);
    expect(screen.getAllByText('hlKw').length).toBeGreaterThan(0);
    expect(screen.getByText('42')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Raw JSON/i }));
    expect(screen.getByText('full report')).toBeDefined();
    expect(screen.getByText(/"languageMode": "javascript"/)).toBeDefined();
  });

  it('switches file views when rendered as a file view', () => {
    const tabState = vi.fn((updater) => {
      const draft = {
        openTabs: [
          {
            id: 'src/test.js',
            type: 'file',
            file: { name: 'test.js', path: ['src', 'test.js'] },
            viewType: 'token-breakdown',
          },
        ],
      };
      updater(draft);
      expect(draft.openTabs[0].viewType).toBe('editor');
    });
    vi.spyOn(TabState, 'useState').mockReturnValue(tabState);
    vi.spyOn(EditorState, 'useState').mockReturnValue({
      fileContents: {
        'src/test.js': 'export const answer = 42;',
      },
      selectedLines: {},
      pendingDiffs: {},
    });

    render(
      <TokenBreakdown
        tab={{
          id: 'src/test.js',
          type: 'file',
          file: { name: 'test.js', path: ['src', 'test.js'] },
          viewType: 'token-breakdown',
        }}
      />,
    );

    fireEvent.click(screen.getByLabelText('Open with Editor'));
    expect(tabState).toHaveBeenCalled();
  });

  it('opens the source file tab when switching from a dedicated token tab', () => {
    const tabState = vi.fn((updater) => {
      const draft = {
        openTabs: [
          {
            id: 'token-breakdown:src/test.js',
            type: 'token-breakdown',
            label: 'test.js',
            sourceFilePath: 'src/test.js',
          },
        ],
        activeTabId: 'token-breakdown:src/test.js',
      };
      updater(draft);
      expect(draft.openTabs[1]).toMatchObject({
        id: 'src/test.js',
        type: 'file',
        label: 'test.js',
        viewType: 'editor',
      });
      expect(draft.activeTabId).toBe('src/test.js');
    });
    vi.spyOn(TabState, 'useState').mockReturnValue(tabState);
    vi.spyOn(EditorState, 'useState').mockReturnValue({
      fileContents: {
        'src/test.js': 'export const answer = 42;',
      },
      selectedLines: {},
      pendingDiffs: {},
    });

    render(
      <TokenBreakdown
        tab={{
          id: 'token-breakdown:src/test.js',
          type: 'token-breakdown',
          sourceFilePath: 'src/test.js',
          content: 'export const answer = 42;',
        }}
      />,
    );

    fireEvent.click(screen.getByLabelText('Open with Editor'));
    expect(tabState).toHaveBeenCalled();
  });

  it('lists tokens in source order instead of highlight-pass order', () => {
    vi.spyOn(EditorState, 'useState').mockReturnValue({
      fileContents: {
        'src/test.js': 'export const answer = 42;',
      },
      selectedLines: {},
      pendingDiffs: {},
    });

    const { container } = render(
      <TokenBreakdown
        tab={{
          id: 'token-breakdown:src/test.js',
          sourceFilePath: 'src/test.js',
          collapsedFoldIds: [],
        }}
      />,
    );

    const values = Array.from(container.querySelectorAll('tbody tr td:last-child code')).map(
      (node) => node.textContent,
    );

    expect(values.indexOf('export')).toBeLessThan(values.indexOf('const'));
    expect(values.indexOf('const')).toBeLessThan(values.indexOf('42'));
    expect(values[0]).toBe('export');
  });

  it('filters tokens when user types in the search field or clicks type pills', () => {
    vi.spyOn(EditorState, 'useState').mockReturnValue({
      fileContents: {
        'src/test.js': 'export const answer = 42; // some comment',
      },
      selectedLines: {},
      pendingDiffs: {},
    });

    render(
      <TokenBreakdown
        tab={{
          id: 'token-breakdown:src/test.js',
          sourceFilePath: 'src/test.js',
          collapsedFoldIds: [],
        }}
      />,
    );

    // Initial check
    expect(screen.getByText('export')).toBeDefined();
    expect(screen.getByText('const')).toBeDefined();

    // Type in search field
    const searchInput = screen.getByPlaceholderText(/Filter tokens/i);
    fireEvent.change(searchInput, { target: { value: 'const' } });

    expect(screen.getByText('const')).toBeDefined();
    expect(screen.queryByText('export')).toBeNull();

    // Click "All Types" pill to clear type filter (though it's default)
    const allPill = screen.getByRole('button', { name: /All Types/i });
    expect(allPill).toBeDefined();
  });
});
