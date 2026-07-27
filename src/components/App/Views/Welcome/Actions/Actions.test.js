import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import WelcomeActions from './Actions';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Info: () => <span />,
    Code: () => <span />,
  },
}));

describe('WelcomeActions', () => {
  it('triggers action callbacks when buttons are clicked', () => {
    const onShowInfo = vi.fn();
    const onShowInstructions = vi.fn();

    render(<WelcomeActions onShowInfo={onShowInfo} onShowInstructions={onShowInstructions} />);

    fireEvent.click(screen.getByText('Project info'));
    expect(onShowInfo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Instructions'));
    expect(onShowInstructions).toHaveBeenCalledTimes(1);
  });
});
