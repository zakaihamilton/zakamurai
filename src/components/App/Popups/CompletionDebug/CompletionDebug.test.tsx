import { EditorState } from '@/components/App/Views/EditorArea';
import { createMockEditorState } from '@/test-utils/editorMocks';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CompletionDebug from './CompletionDebug';

vi.mock('@/components/App/Views/EditorArea', () => ({
  EditorState: { useState: vi.fn() },
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: { Copy: () => <span />, Close: () => <span /> },
}));

describe('CompletionDebug', () => {
  it('returns null when closed', () => {
    vi.mocked(EditorState.useState).mockReturnValue(
      createMockEditorState({ aiCompletionDebug: { status: 'idle', filePath: '' } }),
    );
    const { container } = render(<CompletionDebug isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders debug payload when open', () => {
    vi.mocked(EditorState.useState).mockReturnValue(
      createMockEditorState({
        aiCompletionDebug: {
          status: 'done',
          filePath: 'src/foo.js',
          prompt: 'complete this',
          rawResult: 'raw',
          completion: 'done',
          error: '',
        },
      }),
    );

    render(<CompletionDebug isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('AI Completion Debug')).toBeDefined();
    expect(screen.getByText('src/foo.js')).toBeDefined();
    expect(screen.getByDisplayValue('complete this')).toBeDefined();
  });

  it('closes on escape', () => {
    vi.mocked(EditorState.useState).mockReturnValue(
      createMockEditorState({ aiCompletionDebug: { status: 'idle', filePath: '' } }),
    );
    const onClose = vi.fn();
    render(<CompletionDebug isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
