import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SingleEditorView from './SingleEditorView';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }) => <>{children}</>,
}));

vi.mock('@/utils/navigation', () => ({
  findNavigationTargets: vi.fn(() => []),
}));

describe('SingleEditorView', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs gutter heights by visible row order when folded lines keep original numbers', () => {
    vi.useFakeTimers();
    const scrollContainerRef = { current: null };

    const { container } = render(
      <SingleEditorView
        scrollContainerRef={scrollContainerRef}
        linesCount={12}
        editorLineItems={[{ line: 2 }, { line: 10 }]}
        selectedLines={[]}
        diffActions={{}}
        foldStarts={{ 10: { id: '10:12', startLine: 10, endLine: 12 } }}
        collapsedFoldIds={[]}
        toggleFold={vi.fn()}
        foldLabel="code block"
        editorContent={'line 2\nline 10'}
        handleChange={vi.fn()}
        highlightedCode={
          '<span data-line="1" style="display: block;">line 2</span><span data-line="2" style="display: block;">line 10</span>'
        }
        cursorPos={{ index: 0 }}
        filePath="src/App.js"
        isReadOnly={false}
        navigationLinksEnabled={false}
        fileContents={{}}
      />,
    );

    const codeLines = container.querySelectorAll('[data-line]');
    codeLines[0].getBoundingClientRect = () => ({ height: 22 });
    codeLines[1].getBoundingClientRect = () => ({ height: 44 });

    vi.advanceTimersByTime(50);

    expect(container.querySelector('[data-gutter-line="2"]').style.height).toBe('22px');
    expect(container.querySelector('[data-gutter-line="10"]').style.height).toBe('44px');
  });
});
