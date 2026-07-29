import { createMockPendingDiff } from '@/test-utils/editorMocks';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SideBySideEditorView from './SideBySideEditorView';

vi.mock('./CodeEditor', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange?: (value: string) => void;
  }) => (
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
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
    const diffData = createMockPendingDiff({
      originalContent: 'original code',
      modifiedContent: 'modified code',
    });
    const localContent = 'modified code';

    render(
      <SideBySideEditorView
        diffData={diffData}
        localContent={localContent}
        linesCount={5}
        selectedLines={[]}
        diffActions={{}}
        handleChange={vi.fn()}
        isReadOnly={false}
        navigationLinksEnabled={false}
        filePath="src/App.js"
        handleNavigateToAssociated={vi.fn()}
        fileContents={{}}
        handleJumpToTarget={vi.fn()}
        highlightedCode=""
        originalHighlightedCode=""
      />,
    );

    expect(screen.getAllByTestId('code-editor')).toHaveLength(2);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]!);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('original code');

    fireEvent.click(buttons[1]!);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('modified code');
  });
});
