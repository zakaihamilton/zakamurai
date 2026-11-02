import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DIALOG_FOCUS_RESTORED_EVENT } from '../focusRestore';
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
      <Dialog
        footer={null}
        isOpen={false}
        title="T"
        message="M"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('focuses the primary action and closes on Escape', () => {
    const onCancel = vi.fn();
    render(<Dialog isOpen={true} title="T" message="M" onConfirm={vi.fn()} onCancel={onCancel} />);

    const dialog = screen.getByRole('dialog', { name: 'T' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.activeElement).toBe(dialog.querySelector('button[data-dialog-confirm]'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('traps Tab focus within the dialog', () => {
    const onCancel = vi.fn();
    render(
      <Dialog
        footer={null}
        isOpen={true}
        title="T"
        message="M"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'T' });
    const focusable = dialog.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('renders custom children and footer without default actions', () => {
    render(
      <Dialog
        isOpen={true}
        title="Custom"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        footer={<div>Custom footer</div>}
      >
        <p>Custom body</p>
      </Dialog>,
    );

    expect(screen.getByText('Custom body')).toBeDefined();
    expect(screen.getByText('Custom footer')).toBeDefined();
    expect(screen.queryByText('Confirm')).toBeNull();
  });

  it('announces focus restoration before returning focus to its opener', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onFocusRestored = vi.fn();
    document.addEventListener(DIALOG_FOCUS_RESTORED_EVENT, onFocusRestored);

    const { rerender } = render(
      <Dialog
        footer={null}
        isOpen={true}
        title="T"
        message="M"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    rerender(
      <Dialog
        footer={null}
        isOpen={false}
        title="T"
        message="M"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(onFocusRestored).toHaveBeenCalledWith(expect.objectContaining({ detail: opener }));
    expect(document.activeElement).toBe(opener);
    document.removeEventListener(DIALOG_FOCUS_RESTORED_EVENT, onFocusRestored);
    opener.remove();
  });

  it('sets aria-describedby pointing to the message element', () => {
    render(
      <Dialog
        isOpen={true}
        title="Title"
        message="Detailed message text"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Title' });
    const describedById = dialog.getAttribute('aria-describedby');
    expect(describedById).toBeTruthy();
    expect(document.getElementById(describedById!)?.textContent).toBe('Detailed message text');
  });

  it('handles nested dialogs such that Escape only closes the topmost dialog', () => {
    const onCancelParent = vi.fn();
    const onCancelChild = vi.fn();

    const { rerender } = render(
      <>
        <Dialog
          isOpen={true}
          title="Parent"
          message="Parent body"
          onConfirm={vi.fn()}
          onCancel={onCancelParent}
        />
        <Dialog
          isOpen={true}
          title="Child"
          message="Child body"
          onConfirm={vi.fn()}
          onCancel={onCancelChild}
        />
      </>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancelChild).toHaveBeenCalledOnce();
    expect(onCancelParent).not.toHaveBeenCalled();

    // After child dialog closes
    rerender(
      <Dialog
        isOpen={true}
        title="Parent"
        message="Parent body"
        onConfirm={vi.fn()}
        onCancel={onCancelParent}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancelParent).toHaveBeenCalledOnce();
  });
});
