import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EditorHeader from './EditorHeader';

vi.mock('@/components/Core/Base/Icons', () => ({
  Icons: {
    File: () => <div data-testid="icon-file" />,
    Search: () => <div data-testid="icon-search" />,
    Check: () => <div data-testid="icon-check" />,
    Undo: () => <div data-testid="icon-undo" />,
    Columns: () => <div data-testid="icon-columns" />,
  },
}));

vi.mock('@/components/Widgets/Tooltip/Tooltip', () => ({
  default: ({ children }) => <div data-testid="tooltip">{children}</div>,
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
  };

  it('renders the file path', () => {
    render(<EditorHeader {...defaultProps} />);
    expect(screen.getByText('src/test.js')).toBeDefined();
    expect(screen.getByTestId('icon-file')).toBeDefined();
  });

  it('calls setShowFind when search button is clicked', () => {
    render(<EditorHeader {...defaultProps} />);
    const searchBtn = screen.getByTestId('icon-search').parentElement;
    fireEvent.click(searchBtn);
    expect(defaultProps.setShowFind).toHaveBeenCalledWith(true);
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
