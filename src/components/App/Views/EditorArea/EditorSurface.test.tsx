import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import EditorSurface from './EditorSurface';
import type { EditorContentProps, EditorToolingProps } from './types';

vi.mock('./EditorTooling', () => ({
  default: () => <div data-testid="editor-tooling" />,
}));

vi.mock('./EditorContent', () => ({
  default: ({ children }: { children?: ReactNode }) => (
    <div data-testid="editor-content">{children}</div>
  ),
}));

describe('EditorSurface', () => {
  it('composes editor tooling and content inside the editor shell', () => {
    render(
      <EditorSurface
        toolingProps={{} as EditorToolingProps}
        contentProps={{} as EditorContentProps}
      />,
    );

    expect(screen.getByTestId('editor-tooling')).toBeDefined();
    expect(screen.getByTestId('editor-content')).toBeDefined();
  });
});
