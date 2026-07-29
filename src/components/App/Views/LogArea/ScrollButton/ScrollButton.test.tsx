import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LogScrollButton from './ScrollButton';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    ChevronDown: () => <span>down</span>,
  },
}));

describe('LogScrollButton', () => {
  it('renders the jump to bottom button and handles clicks', () => {
    const onScrollToBottom = vi.fn();
    render(<LogScrollButton onScrollToBottom={onScrollToBottom} />);

    const jumpBtn = screen.getByRole('button', { name: 'Jump to bottom' });
    expect(jumpBtn).toBeDefined();
    fireEvent.click(jumpBtn);
    expect(onScrollToBottom).toHaveBeenCalled();
  });
});
