import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SidebarFilter from './SidebarFilter';

vi.mock('@/components/ui/Icons', () => ({ Icons: { Search: () => <span /> } }));
vi.mock('@/utils/os', () => ({ formatShortcut: (s) => s }));

describe('SidebarFilter', () => {
  it('renders controlled search input', () => {
    const onChange = vi.fn();
    render(<SidebarFilter inputRef={null} value="foo" onChange={onChange} />);

    const input = screen.getByPlaceholderText(/Search files/);
    expect(input.value).toBe('foo');
    fireEvent.change(input, { target: { value: 'bar' } });
    expect(onChange).toHaveBeenCalled();
  });
});
