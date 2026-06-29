import { formatShortcut } from '@/utils/os';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EditorHeader from './EditorHeader';

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    File: () => <div data-testid="icon-file" />,
    Search: () => <div data-testid="icon-search" />,
    Check: () => <div data-testid="icon-check" />,
    Undo: () => <div data-testid="icon-undo" />,
    Columns: () => <div data-testid="icon-columns" />,
    Layout: () => <div data-testid="icon-layout" />,
    Code: () => <div data-testid="icon-code" />,
    Tokens: () => <div data-testid="icon-tokens" />,
    Edit: () => <div data-testid="icon-edit" />,
  },
}));

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children, content, shortcut }) => (
    <div data-testid="tooltip" data-content={content} data-shortcut={shortcut}>
      {children}
    </div>
  ),
}));

describe('EditorHeader', () => {
  const defaultProps = {
    filePath: 'src/test.js',
    showFind: false,
    setShowFind: vi.fn(),
    hasDiff: false,
    handleApprove: vi.fn(),
    handleUndo: vi.fn(),
    showSideBySide: false,
    setShowSideBySide: vi.fn(),
    handleFormat: vi.fn(),
    isReadOnly: false,
    setIsReadOnly: vi.fn(),
  };

  it('renders the file path', () => {
    render(<EditorHeader {...defaultProps} />);
    expect(screen.getByText('src/test.js')).toBeDefined();
    expect(screen.getAllByTestId('icon-file').length).toBeGreaterThan(0);
  });

  it('calls setShowFind when search button is clicked', () => {
    render(<EditorHeader {...defaultProps} />);
    const searchBtn = screen.getByTestId('icon-search').parentElement;
    fireEvent.click(searchBtn);
    expect(defaultProps.setShowFind).toHaveBeenCalledWith(true);
  });

  it('renders edit icon by default when isReadOnly is false', () => {
    const setIsReadOnly = vi.fn();
    render(<EditorHeader {...defaultProps} isReadOnly={false} setIsReadOnly={setIsReadOnly} />);
    expect(screen.getByTestId('icon-edit')).toBeDefined();

    const editBtn = screen.getByTestId('icon-edit').parentElement;
    const tooltip = editBtn.closest('[data-testid="tooltip"]');
    expect(tooltip.getAttribute('data-content')).toBe('Switch to Inspection Mode');
    expect(tooltip.getAttribute('data-shortcut')).toBe(formatShortcut('⌃E'));

    fireEvent.click(editBtn);
    expect(setIsReadOnly).toHaveBeenCalledWith(true);
  });

  it('renders code icon when isReadOnly is true', () => {
    const setIsReadOnly = vi.fn();
    render(<EditorHeader {...defaultProps} isReadOnly={true} setIsReadOnly={setIsReadOnly} />);
    expect(screen.getAllByTestId('icon-code').length).toBeGreaterThan(0);

    const codeBtn = screen
      .getAllByTestId('icon-code')
      .find((icon) =>
        icon.closest('[data-testid="tooltip"]')?.getAttribute('data-shortcut'),
      ).parentElement;
    const tooltip = codeBtn.closest('[data-testid="tooltip"]');
    expect(tooltip.getAttribute('data-content')).toBe('Switch to Edit Mode');
    expect(tooltip.getAttribute('data-shortcut')).toBe(formatShortcut('⌃E'));

    fireEvent.click(codeBtn);
    expect(setIsReadOnly).toHaveBeenCalledWith(false);
  });

  it('renders diff actions when hasDiff is true', () => {
    render(<EditorHeader {...defaultProps} hasDiff={true} />);
    expect(screen.getByText('Review AI Changes:')).toBeDefined();
    expect(screen.getByText('Approve')).toBeDefined();
    expect(screen.getByText('Undo')).toBeDefined();
    expect(screen.getByText('Diff')).toBeDefined();
  });

  it('calls handleApprove when approve button is clicked', () => {
    render(<EditorHeader {...defaultProps} hasDiff={true} />);
    const approveBtn = screen.getByText('Approve');
    fireEvent.click(approveBtn);
    expect(defaultProps.handleApprove).toHaveBeenCalled();
  });

  it('calls handleUndo when undo button is clicked', () => {
    render(<EditorHeader {...defaultProps} hasDiff={true} />);
    const undoBtn = screen.getByText('Undo');
    fireEvent.click(undoBtn);
    expect(defaultProps.handleUndo).toHaveBeenCalled();
  });

  it('calls setShowSideBySide when diff button is clicked', () => {
    render(<EditorHeader {...defaultProps} hasDiff={true} />);
    const diffBtn = screen.getByText('Diff');
    fireEvent.click(diffBtn);
    expect(defaultProps.setShowSideBySide).toHaveBeenCalledWith(true);
  });
});
