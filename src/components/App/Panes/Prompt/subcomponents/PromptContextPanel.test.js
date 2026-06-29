import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PromptContextPanel from './PromptContextPanel';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: { File: () => <span />, Check: () => <span /> },
}));

describe('PromptContextPanel', () => {
  it('renders file and selection context', () => {
    render(
      <PromptContextPanel
        activeFileName="foo.js"
        activeFilePath="src/foo.js"
        selectedLines={[1, 2]}
        selectedLineText="1-2"
        runState="Ready"
      />,
    );

    expect(screen.getByLabelText('AI context')).toBeDefined();
    expect(screen.getByText('foo.js')).toBeDefined();
    expect(screen.getByText('Lines 1-2')).toBeDefined();
    expect(screen.getByText('Ready')).toBeDefined();
  });
});
