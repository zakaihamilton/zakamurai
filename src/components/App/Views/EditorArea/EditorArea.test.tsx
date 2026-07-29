vi.mock('@/components/Storage/Settings', () => ({
  default: { getTemplate: vi.fn(() => 'default') },
}));

vi.mock('@/components/Storage', () => ({
  useFileSystem: vi.fn(() => ({ mode: null, readFile: vi.fn() })),
}));
import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { useFileSystem } from '@/components/Storage';
import { createMockEditorState, createMockTabState } from '@/test-utils/editorMocks';
import { makeFileHandle } from '@/test-utils/fsMocks';
import { makeAppState } from '@/test-utils/stateMocks';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from './EditorArea';
import EditorArea from './EditorArea';
import { highlightCode } from './highlighter';

vi.mock('./highlighter', () => ({
  highlightCode: vi.fn((code) => `highlighted: ${code}`),
}));

vi.mock('@/components/App/AppState', () => ({
  AppState: {
    useState: vi.fn(),
  },
}));

vi.mock('@/components/App/Panes/TabBar', () => {
  const mockPassiveTabState = Object.assign(vi.fn(), { openTabs: [], activeTabId: null });
  return {
    TabState: {
      useState: vi.fn(),
      usePassiveState: vi.fn(() => mockPassiveTabState),
    },
  };
});

describe('EditorArea', () => {
  const setupMocks = (overrides: Parameters<typeof createMockEditorState>[0] = {}) => {
    const state = createMockEditorState({
      cursorPos: {},
      isCompleting: {},
      ...overrides,
    });
    vi.spyOn(EditorState, 'useState').mockReturnValue(state);
    vi.mocked(useFileSystem).mockReturnValue({ mode: null } as ReturnType<typeof useFileSystem>);
    vi.spyOn(AppState, 'useState').mockReturnValue(makeAppState());
    vi.spyOn(TabState, 'useState').mockReturnValue(createMockTabState());
    return state;
  };

  const getTextarea = () => screen.getByRole('textbox') as HTMLTextAreaElement;

  it('renders the file path and content', async () => {
    setupMocks({
      fileContents: {
        'src/test.js': 'console.log("hello");',
      },
    });

    await act(async () => {
      render(<EditorArea file={{ path: ['src', 'test.js'], name: 'test.js' }} />);
    });
    expect(screen.getByText('src/test.js')).toBeDefined();
    expect(getTextarea().value).toBe('console.log("hello");');
  });

  it('falls back to template content for restored tabs without saved content', async () => {
    setupMocks({ fileContents: {} });

    await act(async () => {
      render(<EditorArea file={{ path: ['src', 'App.jsx'], name: 'App.jsx' }} />);
    });

    expect(getTextarea().value).toContain('export default function App');
  });

  it('loads restored local file content from the file system when editor state is empty', async () => {
    setupMocks({ fileContents: {} });
    vi.mocked(useFileSystem).mockReturnValue({
      mode: 'local',
      getFileHandleAtPath: vi.fn().mockResolvedValue({}),
      readFile: vi.fn().mockResolvedValue('const restored = true;'),
    } as unknown as ReturnType<typeof useFileSystem>);

    render(<EditorArea file={{ path: ['local.js'], name: 'local.js' }} />);

    await waitFor(() => {
      expect(getTextarea().value).toBe('const restored = true;');
    });
  });

  it('prefers local file system content over blank saved editor state on reload', async () => {
    setupMocks({ fileContents: { 'local.js': '' } });
    vi.mocked(useFileSystem).mockReturnValue({
      mode: 'local',
      readFile: vi.fn().mockResolvedValue('const restoredFromDisk = true;'),
    } as unknown as ReturnType<typeof useFileSystem>);

    render(
      <EditorArea
        file={{ path: ['local.js'], name: 'local.js' }}
        fsHandle={makeFileHandle('local.js')}
      />,
    );

    await waitFor(() => {
      expect(getTextarea().value).toBe('const restoredFromDisk = true;');
    });
  });

  it('updates the local buffer and clears a pending AI diff after a manual edit', async () => {
    const state = setupMocks({
      fileContents: { 'test.js': 'const answer = 1;' },
      pendingDiffs: {
        'test.js': {
          originalContent: 'const answer = 0;',
          modifiedContent: 'const answer = 1;',
          diffs: [],
        },
      },
    });

    render(<EditorArea file={{ path: ['test.js'], name: 'test.js' }} />);
    await act(async () => {
      fireEvent.change(getTextarea(), { target: { value: 'const answer = 2;' } });
    });

    expect(state.fileContents['test.js']).toBe('const answer = 2;');
    expect(state.pendingDiffs['test.js']).toBeUndefined();
  });

  it('memoizes syntax highlighting', async () => {
    const state = setupMocks({
      fileContents: { 'test.js': 'content' },
    });

    let rerenderFn: RenderResult['rerender'];
    await act(async () => {
      const { rerender } = render(<EditorArea file={{ path: ['test.js'], name: 'test.js' }} />);
      rerenderFn = rerender;
    });

    expect(highlightCode).toHaveBeenCalled();
    const callCount = vi.mocked(highlightCode).mock.calls.length;

    await act(async () => {
      rerenderFn!(<EditorArea file={{ path: ['test.js'], name: 'test.js' }} />);
    });
    expect(highlightCode).toHaveBeenCalledTimes(callCount);

    Object.assign(state, { unrelated: 'change' });
    await act(async () => {
      rerenderFn!(<EditorArea file={{ path: ['test.js'], name: 'test.js' }} />);
    });
    expect(highlightCode).toHaveBeenCalledTimes(callCount);
  });

  it('keeps navigation highlighting enabled after switching files while Command is held', async () => {
    vi.useFakeTimers();
    setupMocks({
      fileContents: { 'test.js': 'content', 'next.js': 'next content' },
      isReadOnly: false,
    });

    let rerenderFn: RenderResult['rerender'];
    await act(async () => {
      const { rerender } = render(<EditorArea file={{ path: ['test.js'], name: 'test.js' }} />);
      rerenderFn = rerender;
    });

    expect(vi.mocked(highlightCode).mock.calls.at(-1)?.[9]).toBe(false);

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Meta' });
    });

    expect(vi.mocked(highlightCode).mock.calls.at(-1)?.[9]).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(vi.mocked(highlightCode).mock.calls.at(-1)?.[9]).toBe(true);

    vi.mocked(highlightCode).mockClear();

    await act(async () => {
      rerenderFn!(<EditorArea file={{ path: ['next.js'], name: 'next.js' }} />);
    });

    expect(vi.mocked(highlightCode).mock.calls.at(-1)?.[9]).toBe(true);

    await act(async () => {
      fireEvent.keyUp(window, { key: 'Meta' });
    });

    expect(vi.mocked(highlightCode).mock.calls.at(-1)?.[9]).toBe(false);

    vi.useRealTimers();
  });

  it('does not enable navigation highlighting when Command is released before the delay', async () => {
    vi.useFakeTimers();
    setupMocks({
      fileContents: { 'test.js': 'content' },
      isReadOnly: false,
    });

    await act(async () => {
      render(<EditorArea file={{ path: ['test.js'], name: 'test.js' }} />);
    });

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Meta' });
    });

    await act(async () => {
      fireEvent.keyUp(window, { key: 'Meta' });
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(vi.mocked(highlightCode).mock.calls.at(-1)?.[9]).toBe(false);

    vi.useRealTimers();
  });
});
