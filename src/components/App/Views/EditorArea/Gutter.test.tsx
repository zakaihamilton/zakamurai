import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import Gutter from './Gutter';
import type { ScrollContainerRef } from './types';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    ChevronDown: () => <span>Collapse</span>,
    ChevronRight: () => <span>Expand</span>,
  },
}));

describe('Gutter', () => {
  it('renders line numbers and toggles selection', () => {
    const toggleLine = vi.fn();
    render(
      <Gutter
        linesCount={3}
        linesArr={['a', 'b', 'c']}
        selectedLines={[2]}
        toggleLine={toggleLine}
        foldStarts={{}}
        collapsedFoldIds={[]}
        toggleFold={vi.fn()}
        scrollRef={{ current: null } as ScrollContainerRef}
      />,
    );

    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();

    const lineOne = screen.getByText('1').closest('[data-gutter-line]');
    expect(lineOne).not.toBeNull();
    fireEvent.click(lineOne!);
    expect(toggleLine).toHaveBeenCalledWith(1);
  });

  it('renders fold toggles and invokes toggleFold', () => {
    const toggleFold = vi.fn();
    render(
      <Gutter
        linesCount={3}
        lineItems={[{ line: 1 }, { line: 2 }, { line: 3 }]}
        selectedLines={[]}
        toggleLine={vi.fn()}
        foldStarts={{ 1: { id: '1:3', startLine: 1, endLine: 3 } }}
        collapsedFoldIds={['1:3']}
        toggleFold={toggleFold}
        foldLabel="code block"
        scrollRef={{ current: null } as ScrollContainerRef}
      />,
    );

    const foldButton = screen.getByLabelText('Expand code block at line 1');
    fireEvent.click(foldButton);
    expect(toggleFold).toHaveBeenCalledWith('1:3');
  });
});
