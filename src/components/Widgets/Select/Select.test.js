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
});
