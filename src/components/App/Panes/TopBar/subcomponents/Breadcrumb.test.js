import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import Breadcrumb from './Breadcrumb';

vi.mock('@/components/Core/Base/Icons', () => ({
  Icons: {
    ChevronRight: () => <div data-testid="chevron-right" />,
  },
}));

describe('Breadcrumb', () => {
  it('renders breadcrumb segments', () => {
    const breadcrumb = ['Zakamurai', 'src', 'components'];
    render(<Breadcrumb breadcrumb={breadcrumb} onBreadcrumbClick={() => {}} />);

    expect(screen.getByText(/Zakamur/)).toBeDefined();
    expect(screen.getByText('src')).toBeDefined();
    expect(screen.getByText('components')).toBeDefined();
    expect(screen.getAllByTestId('chevron-right').length).toBe(2);
  });

  it('calls onBreadcrumbClick when a segment is clicked', () => {
    const breadcrumb = ['Zakamurai', 'src'];
    const onBreadcrumbClick = vi.fn();
    render(<Breadcrumb breadcrumb={breadcrumb} onBreadcrumbClick={onBreadcrumbClick} />);

    fireEvent.click(screen.getByText('src'));
    expect(onBreadcrumbClick).toHaveBeenCalledWith('src', 1);
  });
});
