import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Readiness from './Readiness';

vi.mock('../ProjectInfo/Compatibility', () => ({
  default: () => <section aria-label="Project compatibility" />,
}));
vi.mock('../ProjectInfo/DeviceReadiness', () => ({
  default: () => <section aria-label="Device and AI readiness" />,
}));

describe('Readiness', () => {
  it('composes the runtime and device readiness page', () => {
    render(<Readiness />);

    expect(screen.getByRole('heading', { name: 'Runtime & device readiness' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Project compatibility' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Device and AI readiness' })).toBeDefined();
    expect(screen.getByText(/These checks are read-only/)).toBeDefined();
  });
});
