import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RootLayout from './layout';

vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: 'geist-sans' }),
  Geist_Mono: () => ({ variable: 'geist-mono' }),
}));

describe('RootLayout', () => {
  it('renders children within RootLayout structure', () => {
    const { getByText } = render(
      <RootLayout>
        <div>Hello Child</div>
      </RootLayout>
    );
    expect(getByText('Hello Child')).toBeDefined();
  });
});
