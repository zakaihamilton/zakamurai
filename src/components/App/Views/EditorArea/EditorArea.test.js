import { AppState } from '@/components/App/AppState';
import { TabState } from '@/components/App/Panes/TabBar';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from './EditorArea';
import EditorArea from './EditorArea';

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
    vi.spyOn(EditorState, 'useState').mockReturnValue({
      fileContents: {
        'src/test.js': 'console.log("hello");',
      },
    });
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
});
