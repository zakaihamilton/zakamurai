import { EditorState } from '@/components/App/Views/EditorArea';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TokenBreakdown from './TokenBreakdown';

vi.mock('@/components/Widgets/Tooltip/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/Core/Base/Icons', () => ({
  Icons: {
    Code: () => <span data-testid="icon-code" />,
    Copy: () => <span data-testid="icon-copy" />,
  },
}));

describe('TokenBreakdown', () => {
  it('renders a token breakdown for the source file tab', () => {
    vi.spyOn(EditorState, 'useState').mockReturnValue({
      fileContents: {
        'src/test.js': 'export const answer = 42;',
      },
      selectedLines: {},
      pendingDiffs: {},
    });

    render(
      <TokenBreakdown
        tab={{
          id: 'token-breakdown:src/test.js',
          sourceFilePath: 'src/test.js',
          collapsedFoldIds: [],
        }}
      />,
    );

    expect(screen.getByText('Token Breakdown')).toBeDefined();
    expect(screen.getByText('src/test.js')).toBeDefined();
    expect(screen.getAllByText('Tokens').length).toBeGreaterThan(0);
    expect(screen.getAllByText('hlKw').length).toBeGreaterThan(0);
    expect(screen.getByText('42')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Raw JSON/i }));
    expect(screen.getByText('full report')).toBeDefined();
    expect(screen.getByText(/"languageMode": "javascript"/)).toBeDefined();
  });
});
