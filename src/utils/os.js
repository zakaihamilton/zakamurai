export const isMac = () => {
  if (typeof window === 'undefined') return true;
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
};

export const getModifierKey = () => {
  return isMac() ? '⌘' : 'Ctrl';
};

export const getControlKey = () => {
  return isMac() ? '⌃' : 'Ctrl';
};

export const getShiftKey = () => {
  return isMac() ? '⇧' : 'Shift';
};

export const getEnterKey = () => {
  return isMac() ? '↵' : 'Enter';
};

/**
 * Replaces Mac symbols with Windows/Linux equivalents if necessary.
 * @param {string} shortcut - The shortcut string (e.g., '⌘S', '⌘⇧K')
 * @returns {string} - The formatted shortcut string
 */
export const formatShortcut = (shortcut) => {
  if (isMac()) return shortcut;

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
