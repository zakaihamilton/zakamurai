import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Home from './page';

vi.mock('@/components/App', () => ({
  default: () => <div data-testid="app-mock" />,
}));

describe('Home Page', () => {
  it('renders App component', () => {
    const { getByTestId } = render(<Home />);
    expect(getByTestId('app-mock')).toBeDefined();
  });
});
