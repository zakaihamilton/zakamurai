import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import LogToolbar from './LogToolbar';

vi.mock('@/utils/os', () => ({
  formatShortcut: vi.fn((s) => s),
}));

describe('LogToolbar', () => {
  it('renders search input and action buttons', () => {
    const onFilterChange = vi.fn();
    const onCopyAll = vi.fn();
    const onClearLogs = vi.fn();

    render(
      <LogToolbar
        filterText=""
        onFilterChange={onFilterChange}
        onClearFilter={vi.fn()}
        copied={false}
        onCopyAll={onCopyAll}
        onClearLogs={onClearLogs}
      />,
    );

    const input = screen.getByPlaceholderText('Filter logs');
    expect(input).toBeDefined();

    fireEvent.change(input, { target: { value: 'error' } });
    expect(onFilterChange).toHaveBeenCalled();

    const copyBtn = screen.getByLabelText('Copy all logs');
    fireEvent.click(copyBtn);
    expect(onCopyAll).toHaveBeenCalled();

    const clearBtn = screen.getByLabelText('Clear logs');
    fireEvent.click(clearBtn);
    expect(onClearLogs).toHaveBeenCalled();
  });

  it('renders clear filter button when filterText is non-empty', () => {
    const onClearFilter = vi.fn();

    render(
      <LogToolbar
        filterText="test"
        onFilterChange={vi.fn()}
        onClearFilter={onClearFilter}
        copied={false}
        onCopyAll={vi.fn()}
        onClearLogs={vi.fn()}
      />,
    );

    const clearFilterBtn = screen.getByLabelText('Clear log filter');
    expect(clearFilterBtn).toBeDefined();
    fireEvent.click(clearFilterBtn);
    expect(onClearFilter).toHaveBeenCalled();
  });
});
