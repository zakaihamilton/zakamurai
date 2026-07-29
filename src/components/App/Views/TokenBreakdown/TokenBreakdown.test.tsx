import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { createMockEditorState, createMockTabState } from '@/test-utils/editorMocks';
import { makeTokenBreakdownTab } from '@/test-utils/tokenMocks';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import TokenBreakdown from './TokenBreakdown';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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
    AIPrompt: () => <span data-testid="icon-aiprompt" />,
    Brain: () => <span data-testid="icon-brain" />,
  },
}));

const editorFixture = () =>
  createMockEditorState({
    fileContents: {
      'src/test.js': 'export const answer = 42;',
    },
    selectedLines: {},
    pendingDiffs: {},
  });

describe('TokenBreakdown', () => {
  beforeEach(() => {
    vi.spyOn(TabState, 'useState').mockReturnValue(createMockTabState());
  });

  it('renders a token breakdown for the source file tab', () => {
    vi.spyOn(EditorState, 'useState').mockReturnValue(editorFixture());

    render(
      <TokenBreakdown
        tab={makeTokenBreakdownTab({
          id: 'token-breakdown:src/test.js',
          sourceFilePath: 'src/test.js',
        })}
      />,
    );

    expect(screen.getAllByTestId('icon-tokens').length).toBeGreaterThan(0);
    expect(screen.getByText('src/test.js')).toBeDefined();
    expect(screen.getByLabelText('Open with Editor')).toBeDefined();
    expect(screen.getAllByText('Tokens').length).toBeGreaterThan(0);
    expect(screen.getAllByText('hlKw').length).toBeGreaterThan(0);
    expect(screen.getByText('42')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Raw JSON/i }));
    expect(screen.getByText('concise report')).toBeDefined();
    expect(screen.getByText(/"languageMode": "javascript"/)).toBeDefined();
  });

  it('switches file views when rendered as a file view', () => {
    const tabState = vi.fn((updater) => {
      const draft = {
        openTabs: [
          {
            id: 'src/test.js',
            type: 'file',
            label: 'test.js',
            file: { name: 'test.js', path: ['src', 'test.js'] },
            viewType: 'token-breakdown',
          },
        ],
      };
      updater(draft);
      expect(draft.openTabs[0]?.viewType).toBe('editor');
    });
    vi.spyOn(TabState, 'useState').mockReturnValue(tabState as never);
    vi.spyOn(EditorState, 'useState').mockReturnValue(editorFixture());

    render(
      <TokenBreakdown
        tab={makeTokenBreakdownTab({
          id: 'src/test.js',
          type: 'file',
          label: 'test.js',
          file: { name: 'test.js', path: ['src', 'test.js'] },
          viewType: 'token-breakdown',
        })}
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
    vi.spyOn(TabState, 'useState').mockReturnValue(tabState as never);
    vi.spyOn(EditorState, 'useState').mockReturnValue(editorFixture());

    render(
      <TokenBreakdown
        tab={makeTokenBreakdownTab({
          content: 'export const answer = 42;',
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('Open with Editor'));
    expect(tabState).toHaveBeenCalled();
  });

  it('lists tokens in source order instead of highlight-pass order', () => {
    vi.spyOn(EditorState, 'useState').mockReturnValue(editorFixture());

    const { container } = render(<TokenBreakdown tab={makeTokenBreakdownTab()} />);

    const values = Array.from(container.querySelectorAll('tbody tr td:last-child code')).map(
      (node) => node.textContent,
    );

    expect(values.indexOf('export')).toBeLessThan(values.indexOf('const'));
    expect(values.indexOf('const')).toBeLessThan(values.indexOf('42'));
    expect(values[0]).toBe('export');
  });

  it('filters tokens when user types in the search field or clicks type pills', () => {
    vi.spyOn(EditorState, 'useState').mockReturnValue(
      createMockEditorState({
        fileContents: {
          'src/test.js': 'export const answer = 42; // some comment',
        },
        selectedLines: {},
        pendingDiffs: {},
      }),
    );

    render(<TokenBreakdown tab={makeTokenBreakdownTab()} />);

    expect(screen.getByText('export')).toBeDefined();
    expect(screen.getByText('const')).toBeDefined();

    const searchInput = screen.getByPlaceholderText(/Filter tokens/i);
    fireEvent.change(searchInput, { target: { value: 'const' } });

    expect(screen.getByText('const')).toBeDefined();
    expect(screen.queryByText('export')).toBeNull();

    const allPill = screen.getByRole('button', { name: /All Types/i });
    expect(allPill).toBeDefined();
  });

  it('renders and allows copying combined file and token breakdown in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.useFakeTimers();

    const writeText = vi.fn<(text: string) => Promise<void>>();
    Object.assign(navigator, { clipboard: { writeText } });

    vi.spyOn(EditorState, 'useState').mockReturnValue(editorFixture());

    render(<TokenBreakdown tab={makeTokenBreakdownTab()} />);

    const combinedBtn = screen.getByRole('button', { name: /Copy troubleshooting prompt/i });
    expect(combinedBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(combinedBtn);
    });
    expect(writeText).toHaveBeenCalled();

    const rawCopiedText = writeText.mock.calls[0]?.[0];
    expect(rawCopiedText).toContain(
      'Explain why the tokens in the token breakdown do not match the source file. Here is the source file:',
    );
    expect(rawCopiedText).toContain('export const answer = 42;');
    expect(rawCopiedText).toContain('Here is the token breakdown:');

    const jsonPart = rawCopiedText.substring(rawCopiedText.indexOf('{'));
    const copiedBreakdown = JSON.parse(jsonPart);
    expect(copiedBreakdown.filePath).toBe('src/test.js');

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('performs alignment check and displays success check results', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    vi.spyOn(EditorState, 'useState').mockReturnValue(editorFixture());

    render(<TokenBreakdown tab={makeTokenBreakdownTab()} />);

    const checkBtn = screen.getByRole('button', { name: /Verify token report match/i });
    expect(checkBtn).toBeDefined();

    fireEvent.click(checkBtn);
    expect(screen.getByText('Token Report Alignment Check')).toBeDefined();
    expect(screen.getByText('Match Success')).toBeDefined();
    expect(screen.getByText('Original Length')).toBeDefined();

    vi.unstubAllEnvs();
  });
});
