import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TabContextMenu from './TabContextMenu';

vi.mock('@/components/ui/ContextMenu', () => ({
  default: ({ children, onClose }) => (
    <div data-testid="context-menu">
      {children}
      <button type="button" onClick={onClose}>
        Close menu
      </button>
    </div>
  ),
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    BotSmall: () => <span />,
    Globe: () => <span />,
    Info: () => <span />,
    Image: () => <span />,
    File: () => <span />,
    Close: () => <span />,
    ListX: () => <span />,
  },
}));

describe('TabContextMenu', () => {
  const handlers = {
    onClose: vi.fn(),
    onCloseTab: vi.fn(),
    onCloseOthers: vi.fn(),
    onCloseToLeft: vi.fn(),
    onCloseToRight: vi.fn(),
    onCloseAll: vi.fn(),
  };

  it('returns null when tab is missing', () => {
    const { container } = render(
      <TabContextMenu tab={null} position={{ x: 0, y: 0 }} {...handlers} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows file path sublabel for file tabs', () => {
    const tab = { id: 'src/foo.js', label: 'foo.js', type: 'file', file: { name: 'foo.js' } };
    render(<TabContextMenu tab={tab} position={{ x: 0, y: 0 }} {...handlers} />);

    expect(screen.getByText('/src/foo.js')).toBeDefined();
    expect(screen.getByText('foo.js')).toBeDefined();
  });

  it('shows AI Logs sublabel for logs tabs', () => {
    const tab = { id: 'ai-logs', label: 'Logs', type: 'logs' };
    render(<TabContextMenu tab={tab} position={{ x: 0, y: 0 }} {...handlers} />);

    expect(screen.getByText('AI Logs')).toBeDefined();
  });

  it('invokes close actions and closes menu', () => {
    const onCloseTab = vi.fn();
    const onCloseOthers = vi.fn();
    const onCloseAll = vi.fn();
    const onClose = vi.fn();
    const tab = { id: 'tab1', label: 'Tab 1', type: 'file', file: { name: 'tab1.js' } };

    render(
      <TabContextMenu
        tab={tab}
        position={{ x: 0, y: 0 }}
        onClose={onClose}
        onCloseTab={onCloseTab}
        onCloseOthers={onCloseOthers}
        onCloseToLeft={vi.fn()}
        onCloseToRight={vi.fn()}
        onCloseAll={onCloseAll}
      />,
    );

    fireEvent.click(screen.getByText('Close Tab'));
    expect(onCloseTab).toHaveBeenCalledWith('tab1');
    expect(onClose).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Close Others'));
    expect(onCloseOthers).toHaveBeenCalledWith('tab1');

    fireEvent.click(screen.getByText('Close All Tabs'));
    expect(onCloseAll).toHaveBeenCalled();
  });
});
