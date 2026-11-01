import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PreviewErrorActions, PreviewErrorBanner } from './ErrorOverlay';

vi.mock('@/components/ui/Tooltip', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Icons', () => ({
  Icons: {
    AlertCircle: () => <span>alert</span>,
    Check: () => <span>check</span>,
    Copy: () => <span>copy</span>,
    Close: () => <span>close</span>,
    Sparkles: () => <span>sparkles</span>,
  },
}));

describe('PreviewErrorBanner', () => {
  it('renders nothing when there is no error', () => {
    const { container } = render(
      <PreviewErrorBanner
        displayError={null}
        errorCopied={false}
        onCopyError={vi.fn()}
        onDismissError={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the inline error banner with message', () => {
    render(
      <PreviewErrorBanner
        displayError="ReferenceError: x is not defined"
        errorCopied={false}
        onCopyError={vi.fn()}
        onDismissError={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('ReferenceError: x is not defined')).toBeDefined();
  });
});

describe('PreviewErrorActions', () => {
  it('copies and dismisses errors', () => {
    const onCopy = vi.fn();
    const onDismiss = vi.fn();

    const { rerender } = render(
      <PreviewErrorActions copied={false} onCopy={onCopy} onDismiss={onDismiss} />,
    );

    fireEvent.click(screen.getByLabelText('Copy error'));
    expect(onCopy).toHaveBeenCalled();

    rerender(<PreviewErrorActions copied={true} onCopy={onCopy} onDismiss={onDismiss} />);
    expect(screen.getByLabelText('Copied!')).toBeDefined();

    fireEvent.click(screen.getByLabelText('Dismiss error'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('invokes onFixWithAI when Fix with AI button is clicked', () => {
    const onFixWithAI = vi.fn();
    render(
      <PreviewErrorActions
        copied={false}
        onCopy={vi.fn()}
        onDismiss={vi.fn()}
        onFixWithAI={onFixWithAI}
      />,
    );
    fireEvent.click(screen.getByLabelText('Fix with Local AI'));
    expect(onFixWithAI).toHaveBeenCalled();
  });
});
