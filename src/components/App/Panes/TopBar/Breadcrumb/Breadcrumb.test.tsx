import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Breadcrumb from './Breadcrumb';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({
    children,
    content,
    className,
  }: { children?: React.ReactNode; content?: string; className?: string }) => (
    <div data-tooltip-content={content} className={className}>
      {children}
    </div>
  ),
}));

vi.mock('@/components/ui/Icons', () => ({
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
    expect(screen.getByText('components').parentElement).toHaveAttribute(
      'data-tooltip-content',
      'components',
    );
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
