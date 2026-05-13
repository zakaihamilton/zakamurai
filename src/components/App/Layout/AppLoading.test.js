import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import AppLoading from './AppLoading';

vi.mock('@/components/Core/Base/Icons', () => ({
  Icons: {
    ZLogo: () => <div data-testid="zlogo-icon" />,
  },
}));

describe('AppLoading', () => {
  it('renders loading text and logo', () => {
    render(<AppLoading />);
    expect(screen.getByText('Zakamurai')).toBeDefined();
    expect(screen.getByText('Initializing workspace...')).toBeDefined();
    expect(screen.getByTestId('zlogo-icon')).toBeDefined();
  });
});
