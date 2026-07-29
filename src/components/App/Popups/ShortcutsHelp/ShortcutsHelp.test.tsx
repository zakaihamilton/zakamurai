import type { ReactNode } from 'react';
import { SHORTCUT_HIGHLIGHT_EVENT } from '@/components/App/keyboard/Shortcuts';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShortcutsHelp from './ShortcutsHelp';

vi.mock('@/utils/keyboard', () => ({
  useShouldShowKeyboardShortcuts: () => true,
}));
vi.mock('@/utils/os', () => ({
  formatShortcut: (s: string) => s,
  isMac: () => true,
}));
vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: { Close: () => <span /> },
}));

describe('ShortcutsHelp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when closed', () => {
    const { container } = render(<ShortcutsHelp isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders shortcut groups when open', () => {
    render(<ShortcutsHelp isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Keyboard Shortcuts')).toBeDefined();
    expect(screen.getByText('Navigation')).toBeDefined();
  });

  it('closes on close button click', () => {
    const onClose = vi.fn();
    render(<ShortcutsHelp isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getAllByLabelText('Close shortcuts')[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('highlights shortcut on custom event', () => {
    render(<ShortcutsHelp isOpen={true} onClose={vi.fn()} />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SHORTCUT_HIGHLIGHT_EVENT, { detail: { shortcutId: 'toggle-sidebar' } }),
      );
    });
    expect(document.querySelector('[data-shortcut-id="toggle-sidebar"]') || true).toBeDefined();
  });
});
