import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import WelcomeActions from './Actions';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    Info: () => <span />,
    Code: () => <span />,
    AlertCircle: () => <span />,
  },
}));

describe('WelcomeActions', () => {
  it('triggers action callbacks when buttons are clicked', () => {
    const onShowInfo = vi.fn();
    const onShowInstructions = vi.fn();
    const onShowReadiness = vi.fn();

    render(
      <WelcomeActions
        onShowInfo={onShowInfo}
        onShowInstructions={onShowInstructions}
        onShowReadiness={onShowReadiness}
      />,
    );

    fireEvent.click(screen.getByText('Project info'));
    expect(onShowInfo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Instructions'));
    expect(onShowInstructions).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Readiness'));
    expect(onShowReadiness).toHaveBeenCalledTimes(1);
  });
});
