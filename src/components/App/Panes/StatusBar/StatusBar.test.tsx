import { RagState } from '@/components/AI/RagState';
import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { EditorState } from '@/components/App/Views/EditorArea';
import { useFileSystem } from '@/components/Storage';
import { createMockEditorState } from '@/test-utils/editorMocks';
import { asMockUseFileSystem } from '@/test-utils/fsMocks';
import { makeAppState, makeTabState } from '@/test-utils/stateMocks';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StatusBar from './StatusBar';

vi.mock('@/components/Storage', () => ({
  useFileSystem: vi.fn(() => asMockUseFileSystem({ mode: 'local' })),
}));

vi.mock('@/components/AI/RagState', () => ({
  RagState: { useState: vi.fn(() => ({ status: 'idle' })) },
}));

vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/App/Panes/TabBar', () => ({
  TabState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/ui/Tooltip', () => ({
  __esModule: true,
  default: ({ children, content }: { children: ReactNode; content: ReactNode }) => (
    <div data-tooltip={content}>{children}</div>
  ),
}));

describe('StatusBar', () => {
  beforeEach(() => {
    vi.mocked(useFileSystem).mockReturnValue(asMockUseFileSystem({ mode: 'local' }));
    vi.mocked(RagState.useState).mockReturnValue({ status: 'idle' } as ReturnType<
      typeof RagState.useState
    > extends infer T
      ? T
      : never);
  });

  it('renders project name and filesystem mode', () => {
    vi.mocked(AppState.useState).mockReturnValue(
      makeAppState({ theme: 'dark', projectName: 'Test Project' }),
    );
    vi.mocked(EditorState.useState).mockReturnValue(createMockEditorState());
    vi.mocked(TabState.useState).mockReturnValue(makeTabState({ activeTabId: null, openTabs: [] }));

    render(<StatusBar />);

    expect(screen.getByText('Test Project')).toBeDefined();
    expect(screen.getByText('Local')).toBeDefined();
    expect(screen.getByRole('status', { name: 'Storage: local folder' })).toBeDefined();
  });

  it('renders cursor position and language for active tab', () => {
    vi.mocked(AppState.useState).mockReturnValue(
      makeAppState({ theme: 'dark', projectName: 'Test Project' }),
    );
    vi.mocked(EditorState.useState).mockReturnValue(
      createMockEditorState({
        cursorPos: { 'file.js': { line: 10, col: 5, index: 0 } },
      }),
    );
    vi.mocked(TabState.useState).mockReturnValue(
      makeTabState({
        activeTabId: 'file.js',
        openTabs: [{ id: 'file.js', type: 'file', label: 'file.js' }],
      }),
    );

    render(<StatusBar />);

    expect(screen.getByText(/Ln 10, Col 5/)).toBeDefined();
    expect(screen.getByText('JavaScript')).toBeDefined();
  });

  it('toggles AI completion when button is clicked', () => {
    const editorState = createMockEditorState({
      aiCompletionEnabled: false,
      isCompleting: {},
    });

    vi.mocked(AppState.useState).mockReturnValue(
      makeAppState({ theme: 'dark', projectName: 'Test Project' }),
    );
    vi.mocked(EditorState.useState).mockReturnValue(editorState);
    vi.mocked(TabState.useState).mockReturnValue(
      makeTabState({
        activeTabId: 'file.js',
        openTabs: [{ id: 'file.js', type: 'file', label: 'file.js' }],
      }),
    );

    render(<StatusBar />);

    fireEvent.click(screen.getByRole('button', { name: /Turn AI completion on/i }));
    expect(editorState).toHaveBeenCalled();
  });

  it('shows AI error state when completion fails for the active file', () => {
    vi.mocked(AppState.useState).mockReturnValue(
      makeAppState({ theme: 'dark', projectName: 'Test Project' }),
    );
    vi.mocked(EditorState.useState).mockReturnValue(
      createMockEditorState({
        cursorPos: { 'file.js': { line: 1, col: 1, index: 0 } },
        aiCompletionEnabled: true,
        isCompleting: {},
        aiCompletionDebug: {
          status: 'error',
          filePath: 'file.js',
          error: 'Model missing',
        },
      }),
    );
    vi.mocked(TabState.useState).mockReturnValue(
      makeTabState({
        activeTabId: 'file.js',
        openTabs: [{ id: 'file.js', type: 'file', label: 'file.js' }],
      }),
    );

    render(<StatusBar />);
    expect(screen.getByText('AI Error')).toBeDefined();
  });

  it('shows what AI completion is doing while thinking', () => {
    vi.mocked(AppState.useState).mockReturnValue(
      makeAppState({ theme: 'dark', projectName: 'Test Project' }),
    );
    vi.mocked(EditorState.useState).mockReturnValue(
      createMockEditorState({
        cursorPos: { 'file.js': { line: 1, col: 1, index: 0 } },
        aiCompletionEnabled: true,
        isCompleting: { 'file.js': true },
        completionActivity: {
          'file.js': {
            status: 'thinking',
            phase: 'generating',
            model: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
          },
        },
        aiCompletionDebug: {
          status: 'thinking',
          phase: 'generating',
          filePath: 'file.js',
          model: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
        },
      }),
    );
    vi.mocked(TabState.useState).mockReturnValue(
      makeTabState({
        activeTabId: 'file.js',
        openTabs: [{ id: 'file.js', type: 'file', label: 'file.js' }],
      }),
    );

    const { container } = render(<StatusBar />);

    expect(screen.getByText('Thinking...')).toBeDefined();
    const tooltips = [...container.querySelectorAll('[data-tooltip]')].map((node) =>
      node.getAttribute('data-tooltip'),
    );
    expect(
      tooltips.some((tooltip) => tooltip?.includes('Generating completion with Qwen2.5-Coder-3B')),
    ).toBe(true);
    expect(tooltips.some((tooltip) => tooltip?.includes('Press Esc to cancel.'))).toBe(true);
  });

  it('shows RAG status when indexing is active', () => {
    vi.mocked(RagState.useState).mockReturnValue({ status: 'indexing' } as ReturnType<
      typeof RagState.useState
    > extends infer T
      ? T
      : never);
    vi.mocked(AppState.useState).mockReturnValue(
      makeAppState({ theme: 'dark', projectName: 'Test Project' }),
    );
    vi.mocked(EditorState.useState).mockReturnValue(createMockEditorState());
    vi.mocked(TabState.useState).mockReturnValue(makeTabState({ activeTabId: null, openTabs: [] }));

    render(<StatusBar />);
    expect(screen.getByText('RAG: indexing')).toBeDefined();
  });

  it('renders virtual storage mode when not local', () => {
    vi.mocked(useFileSystem).mockReturnValue(asMockUseFileSystem({ mode: null }));
    vi.mocked(AppState.useState).mockReturnValue(
      makeAppState({ theme: 'light', projectName: 'Test Project' }),
    );
    vi.mocked(EditorState.useState).mockReturnValue(createMockEditorState());
    vi.mocked(TabState.useState).mockReturnValue(makeTabState({ activeTabId: null, openTabs: [] }));

    render(<StatusBar />);

    expect(screen.getByText('Virtual')).toBeDefined();
    expect(
      screen.getByRole('status', { name: 'Storage: browser (virtual filesystem)' }),
    ).toBeDefined();
  });

  it.each([
    ['file.ts', 'TypeScript'],
    ['styles.css', 'CSS'],
    ['index.html', 'HTML'],
    ['data.json', 'JSON'],
    ['README.md', 'Markdown'],
    ['notes.txt', 'Plain Text'],
    ['preview', 'Preview', 'preview'],
    ['logs', 'System Log', 'logs'],
  ])('detects language for %s', (id, language, type = 'file') => {
    vi.mocked(AppState.useState).mockReturnValue(
      makeAppState({ theme: 'dark', projectName: 'Test Project' }),
    );
    vi.mocked(EditorState.useState).mockReturnValue(
      createMockEditorState({
        cursorPos: { [id]: { line: 1, col: 1, index: 0 } },
      }),
    );
    vi.mocked(TabState.useState).mockReturnValue(
      makeTabState({
        activeTabId: id,
        openTabs: [{ id, type: type as 'file' | 'preview' | 'logs', label: id }],
      }),
    );

    render(<StatusBar />);
    expect(screen.getByText(language)).toBeDefined();
  });
});
