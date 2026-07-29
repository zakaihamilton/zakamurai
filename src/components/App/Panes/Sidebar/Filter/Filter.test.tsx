import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SidebarFilter from './Filter';

vi.mock('@/components/ui/Icons', () => ({ Icons: { Search: () => <span /> } }));
vi.mock('@/utils/os', () => ({ formatShortcut: (s: string) => s }));

describe('SidebarFilter', () => {
  it('renders controlled search input', () => {
    const onChange = vi.fn();
    render(<SidebarFilter inputRef={{ current: null }} value="foo" onChange={onChange} />);

    const input = screen.getByPlaceholderText(/Search files/) as HTMLInputElement;
    expect(input.value).toBe('foo');
    fireEvent.change(input, { target: { value: 'bar' } });
    expect(onChange).toHaveBeenCalled();
  });
});
