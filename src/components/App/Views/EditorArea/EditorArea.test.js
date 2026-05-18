import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@/components/App/Panes/TabBar', () => ({
  TabState: {
    useState: vi.fn(),
  },
}));

// No need to mock the whole file, just spy on the state hook
describe('EditorArea', () => {
  it('renders the file path and content', () => {
    const mockState = {
      fileContents: {
        'src/test.js': 'console.log("hello");',
      },
      cursorPos: {},
      isCompleting: {},
    };
    const stateHook = vi.fn((producer) => {
      if (typeof producer === 'function') {
        producer(mockState);
      }
      return mockState;
    });
    // Add properties to the function so it can be used as the state object
    Object.assign(stateHook, mockState);

    vi.spyOn(EditorState, 'useState').mockReturnValue(stateHook);
    vi.spyOn(AppState, 'useState').mockReturnValue({
      fs: { mode: null },
    });
    vi.spyOn(TabState, 'useState').mockReturnValue({
      openTabs: [],
    });

    render(<EditorArea file={{ path: ['src', 'test.js'], name: 'test.js' }} />);
    expect(screen.getByText('src/test.js')).toBeDefined();
    // The content is rendered in a textarea and a pre tag
    const textarea = screen.getByRole('textbox');
    expect(textarea.value).toBe('console.log("hello");');
  });

  it('falls back to template content for restored tabs without saved content', () => {
    const mockState = {
      fileContents: {},
      cursorPos: {},
      isCompleting: {},
    };
    const stateHook = vi.fn((producer) => {
      if (typeof producer === 'function') {
        producer(mockState);
      }
      return mockState;
    });
    Object.assign(stateHook, mockState);

    vi.spyOn(EditorState, 'useState').mockReturnValue(stateHook);
    vi.spyOn(AppState, 'useState').mockReturnValue({ fs: { mode: null } });
    vi.spyOn(TabState, 'useState').mockReturnValue({ openTabs: [] });

    render(<EditorArea file={{ path: ['src', 'App.jsx'], name: 'App.jsx' }} />);

    expect(screen.getByRole('textbox').value).toContain('export default function App');
  });

  it('loads restored local file content from the file system when editor state is empty', async () => {
    const mockState = {
      fileContents: {},
      cursorPos: {},
      isCompleting: {},
    };
    const stateHook = vi.fn((producer) => {
      if (typeof producer === 'function') {
        producer(mockState);
      }
      return mockState;
    });
    Object.assign(stateHook, mockState);

    vi.spyOn(EditorState, 'useState').mockReturnValue(stateHook);
    vi.spyOn(AppState, 'useState').mockReturnValue({
      fs: {
        mode: 'local',
        getFileHandleAtPath: vi.fn().mockResolvedValue({}),
        readFile: vi.fn().mockResolvedValue('const restored = true;'),
      },
    });
    vi.spyOn(TabState, 'useState').mockReturnValue({ openTabs: [] });

    render(<EditorArea file={{ path: ['local.js'], name: 'local.js' }} />);

    await waitFor(() => {
      expect(screen.getByRole('textbox').value).toBe('const restored = true;');
    });
  });

  it('prefers local file system content over blank saved editor state on reload', async () => {
    const mockState = {
      fileContents: { 'local.js': '' },
      cursorPos: {},
      isCompleting: {},
    };
    const stateHook = vi.fn((producer) => {
      if (typeof producer === 'function') {
        producer(mockState);
      }
      return mockState;
    });
    Object.assign(stateHook, mockState);

    vi.spyOn(EditorState, 'useState').mockReturnValue(stateHook);
    vi.spyOn(AppState, 'useState').mockReturnValue({
      fs: {
        mode: 'local',
        readFile: vi.fn().mockResolvedValue('const restoredFromDisk = true;'),
      },
    });
    vi.spyOn(TabState, 'useState').mockReturnValue({ openTabs: [] });

    render(
      <EditorArea
        file={{ path: ['local.js'], name: 'local.js' }}
        fsHandle={{ kind: 'file', name: 'local.js' }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('textbox').value).toBe('const restoredFromDisk = true;');
    });
  });

  it('memoizes syntax highlighting', () => {
    const mockState = {
      fileContents: { 'test.js': 'content' },
      cursorPos: {},
      isCompleting: {},
    };
    const stateHook = vi.fn(() => mockState);
    Object.assign(stateHook, mockState);

    vi.spyOn(EditorState, 'useState').mockReturnValue(stateHook);
    vi.spyOn(AppState, 'useState').mockReturnValue({ fs: { mode: null } });
    vi.spyOn(TabState, 'useState').mockReturnValue({ openTabs: [] });

    const { rerender } = render(<EditorArea file={{ path: ['test.js'], name: 'test.js' }} />);

    // Initial call
    expect(highlightCode).toHaveBeenCalled();
    const callCount = vi.mocked(highlightCode).mock.calls.length;

    // Rerender with same props and same state should NOT call highlightCode again (due to memo)
    rerender(<EditorArea file={{ path: ['test.js'], name: 'test.js' }} />);
    expect(highlightCode).toHaveBeenCalledTimes(callCount);

    // Rerender with different state but SAME content should NOT call highlightCode again
    // We simulate this by having stateHook return the same mockState (or a copy with same content)
    stateHook.mockReturnValue({ ...mockState, unrelated: 'change' });
    rerender(<EditorArea file={{ path: ['test.js'], name: 'test.js' }} />);
    expect(highlightCode).toHaveBeenCalledTimes(callCount);
  });
});
