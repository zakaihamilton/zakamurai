import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import IsolationBanner from './IsolationBanner';

describe('IsolationBanner', () => {
  it('announces the same-origin preview warning', () => {
    render(<IsolationBanner message="Preview is running on the same origin as the IDE." />);
    expect(screen.getByRole('status').textContent).toMatch(/same origin/);
  });
});
