import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import PromptContextPanel from './Context';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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

  it('switches between file and project scope', () => {
    const onScopeChange = vi.fn();
    const { rerender } = render(
      <PromptContextPanel
        scope="file"
        onScopeChange={onScopeChange}
        activeFileName="foo.js"
        activeFilePath="src/foo.js"
        selectedLines={[1]}
        selectedLineText="1"
        runState="Ready"
      />,
    );

    expect(screen.getByRole('button', { name: 'File' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Project' }));
    expect(onScopeChange).toHaveBeenCalledWith('project');

    rerender(
      <PromptContextPanel
        scope="project"
        onScopeChange={onScopeChange}
        activeFileName="foo.js"
        activeFilePath="src/foo.js"
        selectedLines={[1]}
        selectedLineText="1"
        runState="Ready"
      />,
    );
    expect(screen.getByText('Whole project')).toBeDefined();
    expect(screen.queryByText('Selection')).toBeNull();
    expect(screen.getByRole('button', { name: 'Project' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});
