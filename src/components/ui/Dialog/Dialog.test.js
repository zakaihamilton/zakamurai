import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Dialog from './Dialog';

describe('Dialog', () => {
  it('renders when isOpen is true', () => {
    render(
      <Dialog
        isOpen={true}
        title="Test Title"
        message="Test Message"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Test Title')).toBeDefined();
    expect(screen.getByText('Test Message')).toBeDefined();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <Dialog
        isOpen={true}
        title="T"
        message="M"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        confirmText="Yes"
      />,
    );
    fireEvent.click(screen.getByText('Yes'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <Dialog
        isOpen={true}
        title="T"
        message="M"
        onConfirm={vi.fn()}
        onCancel={onCancel}
        cancelText="No"
      />,
    );
    fireEvent.click(screen.getByText('No'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <Dialog isOpen={false} title="T" message="M" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onCancel when backdrop receives Enter or Space keydown', () => {
    const onCancel = vi.fn();
    render(<Dialog isOpen={true} title="T" message="M" onConfirm={vi.fn()} onCancel={onCancel} />);

    const backdrop = screen.getAllByLabelText('Close dialog')[0];
    fireEvent.keyDown(backdrop, { key: 'Enter' });
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(backdrop, { key: ' ' });
    expect(onCancel).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(backdrop, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2); // should not close
  });
});
