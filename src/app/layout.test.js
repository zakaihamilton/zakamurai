import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import RootLayout from './layout';

vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: 'geist-sans' }),
  Geist_Mono: () => ({ variable: 'geist-mono' }),
}));

describe('RootLayout', () => {
  it('renders children within RootLayout structure', () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <div>Hello Child</div>
      </RootLayout>,
    );
    expect(markup).toContain('<html');
    expect(markup).toContain('<body');
    expect(markup).toContain('Hello Child');
  });
});
