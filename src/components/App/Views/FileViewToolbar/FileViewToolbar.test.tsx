import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FileViewToolbar from './FileViewToolbar';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children, content }: { children?: ReactNode; content?: string }) => (
    <div data-tooltip={content}>{children}</div>
  ),
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    File: () => <span data-testid="icon-file" />,
    Code: () => <span data-testid="icon-code" />,
    Image: () => <span data-testid="icon-image" />,
    Tokens: () => <span data-testid="icon-tokens" />,
  },
}));

describe('FileViewToolbar', () => {
  it('returns null when the file has only one view', () => {
    const { container } = render(
      <FileViewToolbar fileName="photo.png" activeViewType="image-viewer" onSelectView={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders view switch buttons for multi-view files', () => {
    render(<FileViewToolbar fileName="App.jsx" activeViewType="editor" onSelectView={vi.fn()} />);

    expect(screen.getByLabelText('Open with')).toBeDefined();
    expect(screen.getByLabelText('Open with Editor')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Open with Token Breakdown')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('calls onSelectView when a view button is clicked', () => {
    const onSelectView = vi.fn();
    render(
      <FileViewToolbar fileName="App.jsx" activeViewType="editor" onSelectView={onSelectView} />,
    );

    fireEvent.click(screen.getByLabelText('Open with Token Breakdown'));
    expect(onSelectView).toHaveBeenCalledWith('token-breakdown');
  });
});
