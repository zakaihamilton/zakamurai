import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from './EditorArea';
import EditorArea from './EditorArea';

// No need to mock the whole file, just spy on the state hook
describe('EditorArea', () => {
  it('renders the file path and content', () => {
    vi.spyOn(EditorState, 'useState').mockReturnValue({
      fileContents: {
        'src/test.js': 'console.log("hello");',
      },
    });

    render(<EditorArea file={{ path: ['src', 'test.js'], name: 'test.js' }} />);
    expect(screen.getByText('src/test.js')).toBeDefined();
    // The content is rendered in a textarea and a pre tag
    const textarea = screen.getByRole('textbox');
    expect(textarea.value).toBe('console.log("hello");');
  });
});
