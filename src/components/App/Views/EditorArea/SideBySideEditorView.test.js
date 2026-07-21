import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SideBySideEditorView from './SideBySideEditorView';

vi.mock('./CodeEditor', () => ({
  default: ({ value, onChange }) => (
    <textarea
      data-testid="code-editor"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

vi.mock('./Gutter', () => ({
  default: () => <div data-testid="gutter" />,
}));

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

describe('SideBySideEditorView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders and supports copying original/modified content', async () => {
    const diffData = { originalContent: 'original code' };
    const localContent = 'modified code';

    render(
      <SideBySideEditorView
        styles={{}}
        diffData={diffData}
        localContent={localContent}
        linesCount={5}
        selectedLines={[]}
        diffActions={{}}
        handleChange={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId('code-editor')).toHaveLength(2);

    // Test copy buttons
    const buttons = screen.getAllByRole('button');
    // First button is copy original
    fireEvent.click(buttons[0]);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('original code');

    // Second button is copy modified
    fireEvent.click(buttons[1]);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('modified code');
  });
});
