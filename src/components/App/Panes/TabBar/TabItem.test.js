import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TabItem from './TabItem';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children, content }) => <span data-content={content}>{children}</span>,
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    BotSmall: () => <span data-testid="icon-bot" />,
    Globe: () => <span data-testid="icon-globe" />,
    Info: () => <span data-testid="icon-info" />,
    Tokens: () => <span data-testid="icon-tokens" />,
    Image: () => <span data-testid="icon-image" />,
    File: () => <span data-testid="icon-file" />,
    Close: () => <span data-testid="icon-close" />,
  },
}));

const defaultHandlers = {
  onTabClick: vi.fn(),
  onCloseTab: vi.fn(),
  onContextMenu: vi.fn(),
  onDragStart: vi.fn(),
  onDragOver: vi.fn(),
  onDragEnd: vi.fn(),
  onDrop: vi.fn(),
  onKeyDown: vi.fn(),
};

describe('TabItem', () => {
  it('renders file tab label and tooltip', () => {
    const tab = { id: 'src/foo.js', label: 'foo.js', type: 'file', file: { name: 'foo.js' } };
    render(<TabItem tab={tab} isActive={false} {...defaultHandlers} />);

    expect(screen.getByText('foo.js')).toBeDefined();
    expect(screen.getByTestId('icon-file')).toBeDefined();
    expect(
      screen.getByText('foo.js').closest('[data-content]')?.getAttribute('data-content'),
    ).toContain('foo.js');
  });

  it('renders token breakdown tab with correct tooltip', () => {
    const tab = {
      id: 'token-breakdown:src/test.js',
      label: 'test.js',
      type: 'token-breakdown',
      sourceFilePath: 'src/test.js',
    };
    render(<TabItem tab={tab} isActive={true} {...defaultHandlers} />);

    expect(screen.getByTestId('icon-tokens')).toBeDefined();
    expect(
      screen.getByText('test.js').closest('[data-content]')?.getAttribute('data-content'),
    ).toBe('Token Breakdown\nsrc/test.js');
  });

  it('calls onTabClick when clicked or Enter pressed', () => {
    const onTabClick = vi.fn();
    const tab = { id: 'tab1', label: 'Tab 1', type: 'file', file: { name: 'tab1.js' } };
    render(
      <TabItem
        tab={tab}
        isActive={false}
        {...defaultHandlers}
        onTabClick={onTabClick}
        onKeyDown={(event, id) => event.key === 'Enter' && onTabClick(id)}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Tab 1' }));
    expect(onTabClick).toHaveBeenCalledWith('tab1');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Tab 1' }), { key: 'Enter' });
    expect(onTabClick).toHaveBeenCalledTimes(2);
  });

  it('calls onCloseTab when close button clicked', () => {
    const onCloseTab = vi.fn();
    const tab = { id: 'tab1', label: 'Tab 1', type: 'file', file: { name: 'tab1.js' } };
    render(<TabItem tab={tab} isActive={true} {...defaultHandlers} onCloseTab={onCloseTab} />);

    fireEvent.click(screen.getByRole('button', { name: /close tab/i }));
    expect(onCloseTab).toHaveBeenCalled();
  });

  it('wires drag handlers', () => {
    const onDragStart = vi.fn();
    const onDragOver = vi.fn();
    const onDrop = vi.fn();
    const tab = { id: 'tab1', label: 'Tab 1', type: 'file', file: { name: 'tab1.js' } };
    render(
      <TabItem
        tab={tab}
        isActive={false}
        {...defaultHandlers}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
      />,
    );

    const tabEl = screen.getByRole('tab', { name: 'Tab 1' });
    fireEvent.dragStart(tabEl);
    expect(onDragStart).toHaveBeenCalled();
    fireEvent.dragOver(tabEl);
    expect(onDragOver).toHaveBeenCalled();
    fireEvent.drop(tabEl);
    expect(onDrop).toHaveBeenCalled();
  });
});
