import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Select from './Select';

const options = [
  { value: 'alpha', label: 'Alpha' },
  { value: 'beta', label: 'Beta' },
];

describe('Select', () => {
  it('keeps open state isolated per instance', async () => {
    render(
      <>
        <Select id="first" value="alpha" options={options} onChange={vi.fn()} />
        <Select id="second" value="beta" options={options} onChange={vi.fn()} />
      </>,
    );

    const first = screen.getByRole('button', { name: 'Alpha' });
    const second = screen.getByRole('button', { name: 'Beta' });

    fireEvent.click(first);

    await waitFor(() => {
      expect(first).toHaveAttribute('aria-expanded', 'true');
      expect(second).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('opens upward when the trigger is near the viewport bottom', async () => {
    render(<Select id="placement" value="alpha" options={options} onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Alpha' });
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      top: 700,
      bottom: 736,
      left: 0,
      right: 200,
      width: 200,
      height: 36,
      x: 0,
      y: 700,
      toJSON: () => {},
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(document.querySelector('[class*="menuAbove"]')).toBeDefined();
    });
  });
});
