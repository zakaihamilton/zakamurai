export const DIALOG_FOCUS_RESTORED_EVENT = 'zakamurai:dialog-focus-restored';

export function notifyDialogFocusRestored(opener: HTMLElement) {
  document.dispatchEvent(
    new CustomEvent<HTMLElement>(DIALOG_FOCUS_RESTORED_EVENT, { detail: opener }),
  );
}
