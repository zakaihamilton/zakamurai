export const isMac = (): boolean => {
  if (typeof window === 'undefined') return true;
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
};

export const getModifierKey = (): string => {
  return isMac() ? '⌘' : 'Ctrl';
};

export const getControlKey = (): string => {
  return isMac() ? '⌃' : 'Ctrl';
};

export const getShiftKey = (): string => {
  return isMac() ? '⇧' : 'Shift';
};

export const getEnterKey = (): string => {
  return isMac() ? '↵' : 'Enter';
};

/**
 * Replaces Mac symbols with Windows/Linux equivalents if necessary.
 */
export const formatShortcut = (shortcut: string): string => {
  if (isMac()) {
    return shortcut
      .replace(/Alt\+/g, '⌥')
      .replace(/ArrowLeft/g, '←')
      .replace(/ArrowRight/g, '→')
      .replace(/ArrowUp/g, '↑')
      .replace(/ArrowDown/g, '↓');
  }

  return shortcut
    .replace(/⌘/g, 'Ctrl+')
    .replace(/⌃/g, 'Ctrl+')
    .replace(/⇧/g, 'Shift+')
    .replace(/⌥/g, 'Alt+')
    .replace(/↵/g, 'Enter')
    .replace(/\+/g, ' + ')
    .replace(/\s+/g, ' ')
    .trim();
};
