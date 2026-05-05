import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ZakamuraiState } from '../State';
import EditorArea from './EditorArea';

vi.mock('../State', () => ({
  ZakamuraiState: {
    useState: vi.fn(),
  },
}));

describe('EditorArea', () => {
  it('renders the file path and content', () => {
    ZakamuraiState.useState.mockReturnValue({
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
